from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.core.security import get_current_user, require_admin
from app.database.connection import get_db
from app.models.sales import Mesa, Venta
from app.models.user import User
from app.schemas.ventas import MesaCreate, MesaResponse, MesaUpdate

router = APIRouter(prefix="/mesas", tags=["Mesas"])


def serialize_table(table: Mesa, sale: Venta | None) -> MesaResponse:
    return MesaResponse(
        id=table.id,
        numero=table.numero,
        nombre=table.nombre,
        capacidad=table.capacidad,
        estado="ocupada" if sale else table.estado,
        activa=table.activa,
        venta_id=sale.id if sale else None,
        venta_total=sale.total if sale else None,
        venta_items=len(sale.detalles) if sale else 0,
        abierta_en=sale.creada_en if sale else None,
    )


def find_open_sale(db: Session, table_id: int) -> Venta | None:
    return (
        db.query(Venta)
        .filter(Venta.mesa_id == table_id, Venta.estado == "abierta")
        .order_by(Venta.id.desc())
        .first()
    )


@router.post("/{table_id}/liberar", response_model=MesaResponse)
def release_empty_table(
    table_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    table = db.query(Mesa).filter_by(id=table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Mesa no encontrada")

    sale = find_open_sale(db, table.id)
    if sale:
        if sale.detalles:
            raise HTTPException(
                status_code=400,
                detail="La mesa ya tiene productos agregados. Debe cobrarse o anularse desde Ventas del día.",
            )
        db.delete(sale)

    table.estado = "libre"
    db.commit()
    db.refresh(table)
    return serialize_table(table, None)


@router.get("", response_model=list[MesaResponse])
def list_tables(
    incluir_inactivas: bool = Query(default=False),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    query = db.query(Mesa)
    if not incluir_inactivas:
        query = query.filter(Mesa.activa.is_(True))
    tables = query.order_by(Mesa.numero, Mesa.nombre).all()
    return [serialize_table(table, find_open_sale(db, table.id)) for table in tables]


@router.post("", response_model=MesaResponse, status_code=status.HTTP_201_CREATED)
def create_table(
    data: MesaCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    if db.query(Mesa).filter_by(numero=data.numero).first():
        raise HTTPException(status_code=409, detail="Ya existe una mesa con ese número")
    table = Mesa(**data.model_dump(), estado="libre")
    db.add(table)
    db.commit()
    db.refresh(table)
    return serialize_table(table, None)


@router.put("/{table_id}", response_model=MesaResponse)
def update_table(
    table_id: int,
    data: MesaUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    table = db.query(Mesa).filter_by(id=table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Mesa no encontrada")
    sale = find_open_sale(db, table.id)
    if sale and data.activa is False:
        raise HTTPException(
            status_code=400,
            detail="No se puede desactivar una mesa con un pedido abierto",
        )
    changes = data.model_dump(exclude_unset=True, exclude_none=True)
    if changes.get("numero") is not None:
        duplicate = db.query(Mesa).filter(
            Mesa.numero == changes["numero"], Mesa.id != table.id
        ).first()
        if duplicate:
            raise HTTPException(status_code=409, detail="Ya existe una mesa con ese número")
    for field, value in changes.items():
        setattr(table, field, value)
    db.commit()
    db.refresh(table)
    return serialize_table(table, sale)


@router.delete("/{table_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_table(
    table_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    table = db.query(Mesa).filter_by(id=table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Mesa no encontrada")
    if find_open_sale(db, table.id):
        raise HTTPException(
            status_code=400,
            detail="Cierra o cobra el pedido activo antes de eliminar esta mesa",
        )

    db.query(Venta).filter(Venta.mesa_id == table.id).update(
        {Venta.mesa_id: None},
        synchronize_session=False,
    )
    db.delete(table)
    db.commit()
