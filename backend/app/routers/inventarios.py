from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.core.security import require_admin
from app.database.connection import get_db
from app.models.catalog import Producto
from app.models.inventory import (
    Compra,
    DetalleCompra,
    MateriaPrima,
    MovimientoInventario,
    Proveedor,
)
from app.models.user import Auditoria, User
from app.schemas.inventarios import (
    AjusteInventario,
    CompraCreate,
    CompraResponse,
    DetalleCompraResponse,
    MateriaPrimaCreate,
    MateriaPrimaResponse,
    MateriaPrimaUpdate,
    MovimientoResponse,
    ProveedorInput,
    ProveedorResponse,
)

router = APIRouter(
    tags=["Inventarios"],
    dependencies=[Depends(require_admin)],
)


def serialize_material(material: MateriaPrima) -> MateriaPrimaResponse:
    return MateriaPrimaResponse(
        id=material.id,
        codigo=material.codigo,
        nombre=material.nombre,
        unidad_medida=material.unidad_medida,
        stock_actual=material.stock_actual,
        stock_minimo=material.stock_minimo,
        costo_promedio=material.costo_promedio,
        activo=material.activo,
        creado_en=material.creado_en,
    )


def serialize_supplier(supplier: Proveedor) -> ProveedorResponse:
    return ProveedorResponse(
        id=supplier.id,
        nombre=supplier.nombre,
        nit_documento=supplier.nit_documento,
        telefono=supplier.telefono,
        contacto=supplier.contacto,
        direccion=supplier.direccion,
        activo=supplier.activo,
        creado_en=supplier.creado_en,
    )


def serialize_purchase(purchase: Compra) -> CompraResponse:
    return CompraResponse(
        id=purchase.id,
        consecutivo=purchase.consecutivo,
        proveedor_id=purchase.proveedor_id,
        proveedor_nombre=purchase.proveedor.nombre,
        numero_factura=purchase.numero_factura,
        usuario_id=purchase.usuario_id,
        usuario_nombre=purchase.usuario.full_name,
        metodo_pago=purchase.metodo_pago,
        total=purchase.total,
        observaciones=purchase.observaciones,
        fecha_compra=purchase.fecha_compra,
        detalles=[
            DetalleCompraResponse(
                id=line.id,
                materia_prima_id=line.materia_prima_id,
                materia_prima_nombre=line.materia_prima.nombre,
                unidad_medida=line.materia_prima.unidad_medida,
                cantidad=line.cantidad,
                costo_unitario=line.costo_unitario,
                subtotal=line.subtotal,
            )
            for line in purchase.detalles
        ],
    )


def ensure_unique_material_code(
    db: Session,
    code: str | None,
    material_id: int | None = None,
) -> None:
    if code is None:
        return
    query = db.query(MateriaPrima).filter(MateriaPrima.codigo == code)
    if material_id is not None:
        query = query.filter(MateriaPrima.id != material_id)
    if query.first():
        raise HTTPException(status_code=409, detail="Ya existe una materia prima con ese código")


def add_inventory_movement(
    db: Session,
    *,
    material: MateriaPrima,
    movement_type: str,
    quantity: float,
    previous_stock: float,
    reference: str,
    user_id: int,
    unit_cost: float | None = None,
) -> None:
    db.add(MovimientoInventario(
        tipo_item="materia_prima",
        materia_prima_id=material.id,
        tipo_movimiento=movement_type,
        cantidad=quantity,
        stock_anterior=previous_stock,
        stock_nuevo=material.stock_actual,
        costo_unitario=unit_cost,
        referencia=reference,
        usuario_id=user_id,
    ))


@router.get("/materias-primas", response_model=list[MateriaPrimaResponse])
def list_materials(
    solo_stock_bajo: bool = Query(default=False),
    buscar: str | None = Query(default=None, min_length=1),
    db: Session = Depends(get_db),
):
    query = db.query(MateriaPrima)
    if solo_stock_bajo:
        query = query.filter(MateriaPrima.stock_actual <= MateriaPrima.stock_minimo)
    if buscar:
        term = f"%{buscar.strip()}%"
        query = query.filter(
            (MateriaPrima.nombre.ilike(term)) | (MateriaPrima.codigo.ilike(term))
        )
    return [serialize_material(row) for row in query.order_by(MateriaPrima.nombre).all()]


@router.post(
    "/materias-primas",
    response_model=MateriaPrimaResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_material(
    data: MateriaPrimaCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    ensure_unique_material_code(db, data.codigo)
    material = MateriaPrima(**data.model_dump())
    db.add(material)
    db.flush()
    if material.stock_actual > 0:
        add_inventory_movement(
            db,
            material=material,
            movement_type="ajuste_positivo",
            quantity=material.stock_actual,
            previous_stock=0,
            reference="Inventario inicial",
            user_id=admin.id,
            unit_cost=material.costo_promedio,
        )
    db.add(Auditoria(
        event_type="materia_prima_creada",
        actor_id=admin.id,
        details=f"Materia prima creada: {material.nombre}",
    ))
    db.commit()
    db.refresh(material)
    return serialize_material(material)


@router.put("/materias-primas/{material_id}", response_model=MateriaPrimaResponse)
def update_material(
    material_id: int,
    data: MateriaPrimaUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    material = db.query(MateriaPrima).filter_by(id=material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Materia prima no encontrada")
    changes = data.model_dump(exclude_unset=True)
    if "codigo" in changes:
        ensure_unique_material_code(db, changes["codigo"], material.id)
    for field, value in changes.items():
        setattr(material, field, value)
    db.add(Auditoria(
        event_type="materia_prima_modificada",
        actor_id=admin.id,
        details=f"Materia prima modificada: {material.nombre}",
    ))
    db.commit()
    db.refresh(material)
    return serialize_material(material)


@router.post("/materias-primas/{material_id}/ajuste", response_model=MateriaPrimaResponse)
def adjust_material_stock(
    material_id: int,
    data: AjusteInventario,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    reason = data.motivo.strip()
    if len(reason) < 3:
        raise HTTPException(status_code=422, detail="El motivo debe incluir al menos 3 caracteres")
    material = db.query(MateriaPrima).filter_by(id=material_id, activo=True).first()
    if not material:
        raise HTTPException(status_code=404, detail="Materia prima no encontrada o inactiva")
    previous = material.stock_actual
    new_stock = (
        previous + data.cantidad
        if data.tipo_movimiento == "ajuste_positivo"
        else previous - data.cantidad
    )
    if new_stock < 0:
        raise HTTPException(status_code=409, detail="El ajuste dejaría el inventario en negativo")
    material.stock_actual = new_stock
    add_inventory_movement(
        db,
        material=material,
        movement_type=data.tipo_movimiento,
        quantity=data.cantidad,
        previous_stock=previous,
        reference=reason,
        user_id=admin.id,
        unit_cost=material.costo_promedio,
    )
    db.add(Auditoria(
        event_type="inventario_ajustado",
        actor_id=admin.id,
        details=(
            f"{data.tipo_movimiento} de {data.cantidad:g} {material.unidad_medida} "
            f"para {material.nombre}: {reason}"
        ),
    ))
    db.commit()
    db.refresh(material)
    return serialize_material(material)


@router.get("/proveedores", response_model=list[ProveedorResponse])
def list_suppliers(db: Session = Depends(get_db)):
    suppliers = db.query(Proveedor).order_by(Proveedor.nombre).all()
    return [serialize_supplier(row) for row in suppliers]


@router.post(
    "/proveedores",
    response_model=ProveedorResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_supplier(
    data: ProveedorInput,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    supplier = Proveedor(**data.model_dump())
    db.add(supplier)
    db.flush()
    db.add(Auditoria(
        event_type="proveedor_creado",
        actor_id=admin.id,
        details=f"Proveedor creado: {supplier.nombre}",
    ))
    db.commit()
    db.refresh(supplier)
    return serialize_supplier(supplier)


@router.put("/proveedores/{supplier_id}", response_model=ProveedorResponse)
def update_supplier(
    supplier_id: int,
    data: ProveedorInput,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    supplier = db.query(Proveedor).filter_by(id=supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    for field, value in data.model_dump().items():
        setattr(supplier, field, value)
    db.add(Auditoria(
        event_type="proveedor_modificado",
        actor_id=admin.id,
        details=f"Proveedor modificado: {supplier.nombre}",
    ))
    db.commit()
    db.refresh(supplier)
    return serialize_supplier(supplier)


@router.get("/compras", response_model=list[CompraResponse])
def list_purchases(db: Session = Depends(get_db)):
    purchases = db.query(Compra).order_by(Compra.fecha_compra.desc()).all()
    return [serialize_purchase(purchase) for purchase in purchases]


@router.post(
    "/compras",
    response_model=CompraResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_purchase(
    data: CompraCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    supplier = db.query(Proveedor).filter_by(id=data.proveedor_id, activo=True).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado o inactivo")

    materials: dict[int, MateriaPrima] = {}
    for line in data.detalles:
        material = db.query(MateriaPrima).filter_by(id=line.materia_prima_id, activo=True).first()
        if not material:
            raise HTTPException(
                status_code=404,
                detail=f"Materia prima {line.materia_prima_id} no encontrada o inactiva",
            )
        materials[material.id] = material

    total = sum(line.cantidad * line.costo_unitario for line in data.detalles)
    purchase = Compra(
        consecutivo="",
        proveedor_id=supplier.id,
        numero_factura=data.numero_factura,
        usuario_id=admin.id,
        metodo_pago=data.metodo_pago,
        total=total,
        observaciones=data.observaciones,
    )
    db.add(purchase)
    db.flush()
    purchase.consecutivo = f"C-{purchase.id:04d}"

    for line in data.detalles:
        material = materials[line.materia_prima_id]
        previous = material.stock_actual
        new_stock = previous + line.cantidad
        material.costo_promedio = (
            (previous * material.costo_promedio + line.cantidad * line.costo_unitario)
            / new_stock
            if new_stock > 0
            else line.costo_unitario
        )
        material.stock_actual = new_stock
        purchase.detalles.append(DetalleCompra(
            materia_prima=material,
            cantidad=line.cantidad,
            costo_unitario=line.costo_unitario,
            subtotal=line.cantidad * line.costo_unitario,
        ))
        add_inventory_movement(
            db,
            material=material,
            movement_type="entrada_compra",
            quantity=line.cantidad,
            previous_stock=previous,
            reference=purchase.consecutivo,
            user_id=admin.id,
            unit_cost=line.costo_unitario,
        )

    db.add(Auditoria(
        event_type="compra_registrada",
        actor_id=admin.id,
        details=f"Compra {purchase.consecutivo} registrada por {total:g} COP",
    ))
    db.commit()
    db.refresh(purchase)
    return serialize_purchase(purchase)


@router.get("/compras/{purchase_id}", response_model=CompraResponse)
def get_purchase(purchase_id: int, db: Session = Depends(get_db)):
    purchase = db.query(Compra).filter_by(id=purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    return serialize_purchase(purchase)


@router.get("/movimientos-inventario", response_model=list[MovimientoResponse])
def list_inventory_movements(
    materia_prima_id: int | None = Query(default=None),
    tipo_movimiento: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(MovimientoInventario)
    if materia_prima_id is not None:
        query = query.filter(MovimientoInventario.materia_prima_id == materia_prima_id)
    if tipo_movimiento:
        query = query.filter(MovimientoInventario.tipo_movimiento == tipo_movimiento)
    movements = query.order_by(MovimientoInventario.fecha.desc()).all()
    return [
        MovimientoResponse(
            id=row.id,
            tipo_item=row.tipo_item,
            materia_prima_id=row.materia_prima_id,
            producto_id=row.producto_id,
            item_nombre=(
                row.materia_prima.nombre if row.materia_prima
                else row.producto.nombre if row.producto
                else "Artículo eliminado"
            ),
            tipo_movimiento=row.tipo_movimiento,
            cantidad=row.cantidad,
            stock_anterior=row.stock_anterior,
            stock_nuevo=row.stock_nuevo,
            costo_unitario=row.costo_unitario,
            referencia=row.referencia,
            usuario_id=row.usuario_id,
            usuario_nombre=row.usuario.full_name,
            fecha=row.fecha,
        )
        for row in movements
    ]
