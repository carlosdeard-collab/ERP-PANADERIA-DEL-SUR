from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.security import get_current_user, require_admin
from app.database.connection import get_db
from app.models.catalog import Producto
from app.models.sales import DetalleVenta, Mesa, Pago, Venta
from app.models.user import Auditoria, User
from app.schemas.ventas import (
    MostradorInput,
    PagoInput,
    VentaItemInput,
    VentaItemResponse,
    VentaResponse,
)

router = APIRouter(prefix="/ventas", tags=["Ventas POS"])
COLOMBIA_TZ = timezone(timedelta(hours=-5), "America/Bogota")


def serialize_sale(sale: Venta) -> VentaResponse:
    return VentaResponse(
        id=sale.id,
        consecutivo=sale.consecutivo,
        tipo_atencion=sale.tipo_atencion,
        mesa_id=sale.mesa_id,
        mesa_nombre=sale.mesa.nombre if sale.mesa else None,
        usuario_id=sale.usuario_id,
        usuario_nombre=sale.usuario.full_name,
        estado=sale.estado,
        subtotal=sale.subtotal,
        descuento=sale.descuento,
        total=sale.total,
        observaciones=sale.observaciones,
        creada_en=sale.creada_en,
        cerrada_en=sale.cerrada_en,
        detalles=[
            VentaItemResponse(
                id=item.id,
                producto_id=item.producto_id,
                codigo=item.producto.codigo,
                nombre=item.producto.nombre,
                cantidad=item.cantidad,
                precio_unitario=item.precio_unitario,
                subtotal=item.subtotal,
                notas=item.notas,
            )
            for item in sale.detalles
        ],
        pagos=[
            {
                "id": payment.id,
                "metodo_pago": payment.metodo_pago,
                "monto": payment.monto,
                "monto_recibido": payment.monto_recibido,
                "cambio": payment.cambio,
                "registrado_en": payment.registrado_en,
            }
            for payment in sale.pagos
        ],
    )


def require_open_sale(db: Session, sale_id: int) -> Venta:
    sale = db.query(Venta).filter_by(id=sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    if sale.estado != "abierta":
        raise HTTPException(status_code=409, detail="La venta ya no está abierta")
    return sale


def recalculate(sale: Venta) -> None:
    sale.subtotal = sum(item.subtotal for item in sale.detalles)
    sale.total = max(0, sale.subtotal - sale.descuento)


def next_consecutive(sale: Venta) -> str:
    sale.consecutivo = f"V-{sale.id:04d}"
    return sale.consecutivo


def validate_stock(db: Session, items: list[DetalleVenta]) -> None:
    required: dict[int, int] = defaultdict(int)
    for item in items:
        required[item.producto_id] += item.cantidad
    for product_id, quantity in required.items():
        product = db.query(Producto).filter_by(id=product_id).first()
        if product is None:
            raise HTTPException(status_code=409, detail="Un producto de la venta ya no existe")
        if product.controlar_stock and product.stock_actual < quantity:
            raise HTTPException(
                status_code=409,
                detail=f"Stock insuficiente para {product.nombre}: disponibles {product.stock_actual}",
            )


def deduct_stock(db: Session, sale: Venta) -> None:
    validate_stock(db, sale.detalles)
    for item in sale.detalles:
        product = db.query(Producto).filter_by(id=item.producto_id).one()
        if product.controlar_stock:
            product.stock_actual -= item.cantidad
            item.stock_descontado = True


def register_payment(sale: Venta, payment: PagoInput) -> None:
    received = payment.monto_recibido if payment.monto_recibido is not None else sale.total
    if payment.metodo_pago == "efectivo":
        if received < sale.total:
            raise HTTPException(status_code=400, detail="El monto recibido no cubre el total")
        change = received - sale.total
    else:
        if received != sale.total:
            raise HTTPException(status_code=400, detail="El monto recibido debe coincidir con el total")
        change = 0
    sale.pagos.append(Pago(
        metodo_pago=payment.metodo_pago,
        monto=sale.total,
        monto_recibido=received,
        cambio=change,
    ))


def create_sale(db: Session, user: User, tipo: str, mesa_id: int | None = None) -> Venta:
    sale = Venta(
        consecutivo="",
        tipo_atencion=tipo,
        mesa_id=mesa_id,
        usuario_id=user.id,
        estado="abierta",
        subtotal=0,
        descuento=0,
        total=0,
    )
    db.add(sale)
    db.flush()
    next_consecutive(sale)
    return sale


def add_or_update_item(db: Session, sale: Venta, item: VentaItemInput) -> None:
    product = db.query(Producto).filter_by(id=item.producto_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    detail = next(
        (row for row in sale.detalles if row.producto_id == product.id),
        None,
    )
    if not product.disponible and detail is None:
        raise HTTPException(status_code=404, detail="Producto no disponible")
    if product.controlar_stock and item.cantidad > product.stock_actual:
        raise HTTPException(
            status_code=409,
            detail=f"Stock insuficiente para {product.nombre}: disponibles {product.stock_actual}",
        )
    if detail:
        detail.cantidad = item.cantidad
        detail.precio_unitario = product.precio_venta
        detail.subtotal = item.cantidad * product.precio_venta
        detail.notas = item.notas
    else:
        sale.detalles.append(DetalleVenta(
            producto_id=product.id,
            producto=product,
            cantidad=item.cantidad,
            precio_unitario=product.precio_venta,
            subtotal=item.cantidad * product.precio_venta,
            notas=item.notas,
        ))
    recalculate(sale)


@router.post("/mesas/{mesa_id}/abrir", response_model=VentaResponse)
def open_table_sale(
    mesa_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    table = db.query(Mesa).filter_by(id=mesa_id, activa=True).first()
    if not table:
        raise HTTPException(status_code=404, detail="Mesa no encontrada o inactiva")
    existing = (
        db.query(Venta)
        .filter(Venta.mesa_id == table.id, Venta.estado == "abierta")
        .order_by(Venta.id.desc())
        .first()
    )
    if existing:
        return serialize_sale(existing)
    sale = create_sale(db, user, "mesa", table.id)
    table.estado = "ocupada"
    db.commit()
    db.refresh(sale)
    return serialize_sale(sale)


@router.post("/{sale_id}/items", response_model=VentaResponse)
def update_sale_item(
    sale_id: int,
    item: VentaItemInput,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    sale = require_open_sale(db, sale_id)
    add_or_update_item(db, sale, item)
    db.commit()
    db.refresh(sale)
    return serialize_sale(sale)


@router.delete("/{sale_id}/items/{detail_id}", response_model=VentaResponse)
def delete_sale_item(
    sale_id: int,
    detail_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    sale = require_open_sale(db, sale_id)
    detail = next((row for row in sale.detalles if row.id == detail_id), None)
    if not detail:
        raise HTTPException(status_code=404, detail="Producto de la venta no encontrado")
    sale.detalles.remove(detail)
    db.delete(detail)
    recalculate(sale)
    db.commit()
    db.refresh(sale)
    return serialize_sale(sale)


@router.post("/mostrador", response_model=VentaResponse, status_code=status.HTTP_201_CREATED)
def create_counter_sale(
    data: MostradorInput,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sale = create_sale(db, user, "mostrador")
    sale.observaciones = data.observaciones
    for item in data.items:
        add_or_update_item(db, sale, item)
    recalculate(sale)
    deduct_stock(db, sale)
    register_payment(sale, data.pago)
    sale.estado = "pagada"
    sale.cerrada_en = datetime.now(timezone.utc)
    db.commit()
    db.refresh(sale)
    return serialize_sale(sale)


@router.post("/{sale_id}/cobrar", response_model=VentaResponse)
def charge_table_sale(
    sale_id: int,
    payment: PagoInput,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    sale = require_open_sale(db, sale_id)
    if sale.tipo_atencion != "mesa":
        raise HTTPException(status_code=400, detail="Solo se pueden cobrar ventas de mesa por esta ruta")
    if not sale.detalles:
        raise HTTPException(status_code=400, detail="Agrega productos antes de cobrar")
    deduct_stock(db, sale)
    register_payment(sale, payment)
    sale.estado = "pagada"
    sale.cerrada_en = datetime.now(timezone.utc)
    if sale.mesa:
        sale.mesa.estado = "libre"
    db.commit()
    db.refresh(sale)
    return serialize_sale(sale)


@router.get("", response_model=list[VentaResponse])
def list_daily_sales(
    fecha_inicio: date | None = None,
    fecha_fin: date | None = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    if fecha_inicio is None and fecha_fin is None:
        fecha_inicio = datetime.now(COLOMBIA_TZ).date()
        fecha_fin = fecha_inicio
    if fecha_inicio is not None and fecha_fin is not None and fecha_inicio > fecha_fin:
        raise HTTPException(status_code=400, detail="La fecha de inicio no puede ser posterior a la fecha final")

    query = db.query(Venta)
    if fecha_inicio is not None:
        start = datetime.combine(fecha_inicio, time.min, tzinfo=COLOMBIA_TZ).astimezone(timezone.utc)
        query = query.filter(Venta.creada_en >= start)
    if fecha_fin is not None:
        end = datetime.combine(fecha_fin + timedelta(days=1), time.min, tzinfo=COLOMBIA_TZ).astimezone(timezone.utc)
        query = query.filter(Venta.creada_en < end)
    sales = query.order_by(Venta.creada_en.desc()).all()
    return [serialize_sale(sale) for sale in sales]


@router.get("/{sale_id}", response_model=VentaResponse)
def get_sale(
    sale_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    sale = db.query(Venta).filter_by(id=sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    return serialize_sale(sale)


@router.post("/{sale_id}/anular", response_model=VentaResponse)
def cancel_sale(
    sale_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    sale = db.query(Venta).filter_by(id=sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    if sale.estado == "anulada":
        raise HTTPException(status_code=409, detail="La venta ya está anulada")
    if sale.estado == "pagada":
        for item in sale.detalles:
            if item.stock_descontado:
                item.producto.stock_actual += item.cantidad
                item.stock_descontado = False
    if sale.mesa and sale.estado == "abierta":
        sale.mesa.estado = "libre"
    sale.estado = "anulada"
    sale.cerrada_en = datetime.now(timezone.utc)
    db.add(Auditoria(
        event_type="venta_anulada",
        actor_id=admin.id,
        details=f"Venta {sale.consecutivo} anulada. Total: {sale.total:g} COP",
    ))
    db.commit()
    db.refresh(sale)
    return serialize_sale(sale)
