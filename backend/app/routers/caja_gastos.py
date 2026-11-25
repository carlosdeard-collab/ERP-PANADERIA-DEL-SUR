from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.security import get_current_user, require_admin
from app.database.connection import get_db
from app.models.cash import CierreCaja, Gasto
from app.models.inventory import Compra
from app.models.sales import Pago, Venta
from app.models.user import Auditoria, User
from app.schemas.caja_gastos import (
    AperturaCaja,
    CategoriaGasto,
    CierreCajaInput,
    CierreCajaResponse,
    GastoCreate,
    GastoResponse,
)

router = APIRouter(tags=["Caja y gastos"])


def _sum(query) -> float:
    return float(query.scalar() or 0)


def calculate_totals(db: Session, cash_close: CierreCaja, until: datetime) -> dict[str, float]:
    sale_period = (
        Pago.registrado_en >= cash_close.fecha_apertura,
        Pago.registrado_en <= until,
        Venta.estado == "pagada",
    )
    cash_sales = _sum(
        db.query(func.sum(Pago.monto))
        .join(Venta, Pago.venta_id == Venta.id)
        .filter(*sale_period, Pago.metodo_pago == "efectivo")
    )
    digital_sales = _sum(
        db.query(func.sum(Pago.monto))
        .join(Venta, Pago.venta_id == Venta.id)
        .filter(*sale_period, Pago.metodo_pago != "efectivo")
    )
    cash_expenses = _sum(
        db.query(func.sum(Gasto.monto)).filter(
            Gasto.cierre_caja_id == cash_close.id,
            Gasto.anulado.is_(False),
            Gasto.metodo_pago == "efectivo_caja",
        )
    )
    cash_purchases = _sum(
        db.query(func.sum(Compra.total)).filter(
            Compra.fecha_compra >= cash_close.fecha_apertura,
            Compra.fecha_compra <= until,
            Compra.metodo_pago == "efectivo",
        )
    )
    total_sales = cash_sales + digital_sales
    return {
        "ventas_efectivo": cash_sales,
        "ventas_digitales": digital_sales,
        "total_ventas": total_sales,
        "gastos_efectivo": cash_expenses,
        "compras_efectivo": cash_purchases,
        "efectivo_esperado": (
            cash_close.base_inicial + cash_sales - cash_expenses - cash_purchases
        ),
    }


def serialize_close(
    cash_close: CierreCaja,
    totals: dict[str, float] | None = None,
) -> CierreCajaResponse:
    values = totals or {
        "ventas_efectivo": cash_close.ventas_efectivo,
        "ventas_digitales": cash_close.ventas_digitales,
        "total_ventas": cash_close.total_ventas,
        "gastos_efectivo": cash_close.gastos_efectivo,
        "compras_efectivo": cash_close.compras_efectivo,
        "efectivo_esperado": cash_close.efectivo_esperado,
    }
    return CierreCajaResponse(
        id=cash_close.id,
        consecutivo=cash_close.consecutivo,
        usuario_apertura_id=cash_close.usuario_apertura_id,
        usuario_apertura_nombre=cash_close.usuario_apertura.full_name,
        usuario_cierre_id=cash_close.usuario_cierre_id,
        usuario_cierre_nombre=(
            cash_close.usuario_cierre.full_name if cash_close.usuario_cierre else None
        ),
        estado=cash_close.estado,
        fecha_apertura=cash_close.fecha_apertura,
        fecha_cierre=cash_close.fecha_cierre,
        base_inicial=cash_close.base_inicial,
        ventas_efectivo=values["ventas_efectivo"],
        ventas_digitales=values["ventas_digitales"],
        total_ventas=values["total_ventas"],
        gastos_efectivo=values["gastos_efectivo"],
        compras_efectivo=values["compras_efectivo"],
        efectivo_esperado=values["efectivo_esperado"],
        efectivo_contado=cash_close.efectivo_contado,
        diferencia=cash_close.diferencia,
        observaciones=cash_close.observaciones,
    )


def serialize_expense(expense: Gasto) -> GastoResponse:
    return GastoResponse(
        id=expense.id,
        consecutivo=expense.consecutivo,
        categoria=expense.categoria,
        descripcion=expense.descripcion,
        monto=expense.monto,
        metodo_pago=expense.metodo_pago,
        comprobante_ref=expense.comprobante_ref,
        cierre_caja_id=expense.cierre_caja_id,
        cierre_caja_consecutivo=(
            expense.cierre_caja.consecutivo if expense.cierre_caja else None
        ),
        usuario_id=expense.usuario_id,
        usuario_nombre=expense.usuario.full_name,
        anulado=expense.anulado,
        fecha_gasto=expense.fecha_gasto,
    )


@router.get("/caja/activa", response_model=CierreCajaResponse | None)
def get_active_cash(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    cash_close = db.query(CierreCaja).filter_by(estado="abierta").first()
    if not cash_close:
        return None
    totals = calculate_totals(db, cash_close, datetime.now(timezone.utc))
    return serialize_close(cash_close, totals)


@router.post(
    "/caja/abrir",
    response_model=CierreCajaResponse,
    status_code=status.HTTP_201_CREATED,
)
def open_cash(
    data: AperturaCaja,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if db.query(CierreCaja).filter_by(estado="abierta").first():
        raise HTTPException(status_code=400, detail="Ya existe una caja abierta")
    cash_close = CierreCaja(
        consecutivo="",
        usuario_apertura_id=user.id,
        estado="abierta",
        base_inicial=data.base_inicial,
        efectivo_esperado=data.base_inicial,
        observaciones=data.observaciones.strip() if data.observaciones else None,
    )
    db.add(cash_close)
    db.flush()
    cash_close.consecutivo = f"CJ-{cash_close.id:04d}"
    db.add(Auditoria(
        event_type="caja_abierta",
        actor_id=user.id,
        details=f"Caja {cash_close.consecutivo} abierta con base de {data.base_inicial:g} COP",
    ))
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        if "cierres_caja.estado" in str(error.orig):
            raise HTTPException(status_code=400, detail="Ya existe una caja abierta")
        raise
    db.refresh(cash_close)
    return serialize_close(cash_close)


@router.post("/caja/{cash_close_id}/cerrar", response_model=CierreCajaResponse)
def close_cash(
    cash_close_id: int,
    data: CierreCajaInput,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cash_close = db.query(CierreCaja).filter_by(id=cash_close_id, estado="abierta").first()
    if not cash_close:
        raise HTTPException(status_code=404, detail="Caja abierta no encontrada")
    closed_at = datetime.now(timezone.utc)
    totals = calculate_totals(db, cash_close, closed_at)
    for field, value in totals.items():
        setattr(cash_close, field, value)
    cash_close.efectivo_contado = data.efectivo_contado
    cash_close.diferencia = data.efectivo_contado - totals["efectivo_esperado"]
    cash_close.estado = "cerrada"
    cash_close.usuario_cierre_id = user.id
    cash_close.fecha_cierre = closed_at
    if data.observaciones and data.observaciones.strip():
        close_note = f"Cierre: {data.observaciones.strip()}"
        cash_close.observaciones = (
            f"{cash_close.observaciones}\n{close_note}"
            if cash_close.observaciones
            else close_note
        )
    db.add(Auditoria(
        event_type="caja_cerrada",
        actor_id=user.id,
        details=(
            f"Caja {cash_close.consecutivo} cerrada. Esperado "
            f"{cash_close.efectivo_esperado:g} COP, contado "
            f"{data.efectivo_contado:g} COP, diferencia {cash_close.diferencia:g} COP"
        ),
    ))
    db.commit()
    db.refresh(cash_close)
    return serialize_close(cash_close)


@router.get("/caja/historial", response_model=list[CierreCajaResponse])
def cash_history(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    cash_closes = (
        db.query(CierreCaja)
        .filter_by(estado="cerrada")
        .order_by(CierreCaja.fecha_cierre.desc())
        .all()
    )
    return [serialize_close(cash_close) for cash_close in cash_closes]


@router.get("/gastos", response_model=list[GastoResponse])
def list_expenses(
    fecha_desde: date | None = Query(default=None),
    fecha_hasta: date | None = Query(default=None),
    categoria: CategoriaGasto | None = Query(default=None),
    anulado: bool | None = Query(default=None),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    if fecha_desde and fecha_hasta and fecha_desde > fecha_hasta:
        raise HTTPException(status_code=422, detail="La fecha inicial no puede ser posterior a la final")
    query = db.query(Gasto)
    if fecha_desde is not None:
        query = query.filter(func.date(Gasto.fecha_gasto) >= fecha_desde.isoformat())
    if fecha_hasta is not None:
        query = query.filter(func.date(Gasto.fecha_gasto) <= fecha_hasta.isoformat())
    if categoria:
        query = query.filter(Gasto.categoria == categoria)
    if anulado is not None:
        query = query.filter(Gasto.anulado.is_(anulado))
    expenses = query.order_by(Gasto.fecha_gasto.desc()).all()
    return [serialize_expense(expense) for expense in expenses]


@router.post(
    "/gastos",
    response_model=GastoResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_expense(
    data: GastoCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    cash_close = None
    if data.metodo_pago == "efectivo_caja":
        cash_close = db.query(CierreCaja).filter_by(estado="abierta").first()
        if not cash_close:
            raise HTTPException(
                status_code=400,
                detail="Debe abrirse una caja antes de registrar un gasto en efectivo de caja",
            )
    description = data.descripcion.strip()
    if len(description) < 2:
        raise HTTPException(status_code=422, detail="La descripción debe tener al menos 2 caracteres")
    expense = Gasto(
        consecutivo="",
        categoria=data.categoria,
        descripcion=description,
        monto=data.monto,
        metodo_pago=data.metodo_pago,
        comprobante_ref=data.comprobante_ref.strip() if data.comprobante_ref else None,
        cierre_caja=cash_close,
        usuario_id=admin.id,
    )
    db.add(expense)
    db.flush()
    expense.consecutivo = f"G-{expense.id:04d}"
    db.add(Auditoria(
        event_type="gasto_registrado",
        actor_id=admin.id,
        details=f"Gasto {expense.consecutivo}: {expense.descripcion}, {expense.monto:g} COP",
    ))
    db.commit()
    db.refresh(expense)
    return serialize_expense(expense)


@router.post("/gastos/{expense_id}/anular", response_model=GastoResponse)
def cancel_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    expense = db.query(Gasto).filter_by(id=expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    if expense.anulado:
        raise HTTPException(status_code=409, detail="El gasto ya está anulado")
    expense.anulado = True
    db.add(Auditoria(
        event_type="gasto_anulado",
        actor_id=admin.id,
        details=f"Gasto {expense.consecutivo} anulado: {expense.monto:g} COP",
    ))
    db.commit()
    db.refresh(expense)
    return serialize_expense(expense)
