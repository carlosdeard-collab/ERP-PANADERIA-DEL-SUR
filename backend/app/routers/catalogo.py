from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.core.security import get_current_user, require_admin
from app.database.connection import get_db
from app.models.catalog import Categoria, Producto
from app.models.user import Auditoria, User
from app.schemas.catalogo import (
    CategoriaCreate,
    CategoriaResponse,
    CategoriaUpdate,
    ProductoCreate,
    ProductoResponse,
    ProductoUpdate,
)

router = APIRouter(tags=["Catálogo"])


def serialize_category(category: Categoria) -> CategoriaResponse:
    return CategoriaResponse(
        id=category.id,
        nombre=category.nombre,
        descripcion=category.descripcion,
        activa=category.activa,
    )


def serialize_product(product: Producto) -> ProductoResponse:
    return ProductoResponse(
        id=product.id,
        codigo=product.codigo,
        nombre=product.nombre,
        descripcion=product.descripcion,
        categoria_id=product.categoria_id,
        categoria_nombre=product.categoria.nombre,
        precio_venta=product.precio_venta,
        costo_estimado=product.costo_estimado,
        stock_actual=product.stock_actual,
        controlar_stock=product.controlar_stock,
        disponible=product.disponible,
        creado_en=product.creado_en.isoformat(),
    )


@router.get("/categorias", response_model=list[CategoriaResponse])
def list_categories(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return [
        serialize_category(category)
        for category in db.query(Categoria).order_by(Categoria.nombre).all()
    ]


@router.post(
    "/categorias",
    response_model=CategoriaResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_category(
    data: CategoriaCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    if db.query(Categoria).filter_by(nombre=data.nombre).first():
        raise HTTPException(status_code=409, detail="Ya existe una categoría con ese nombre")
    category = Categoria(nombre=data.nombre, descripcion=data.descripcion, activa=True)
    db.add(category)
    db.commit()
    db.refresh(category)
    return serialize_category(category)


@router.put("/categorias/{category_id}", response_model=CategoriaResponse)
def update_category(
    category_id: int,
    data: CategoriaUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    category = db.query(Categoria).filter_by(id=category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    if data.nombre is not None and data.nombre != category.nombre:
        if db.query(Categoria).filter_by(nombre=data.nombre).first():
            raise HTTPException(status_code=409, detail="Ya existe una categoría con ese nombre")
        category.nombre = data.nombre
    if "descripcion" in data.model_fields_set:
        category.descripcion = data.descripcion
    if data.activa is not None:
        category.activa = data.activa
    db.commit()
    db.refresh(category)
    return serialize_category(category)


@router.get("/productos", response_model=list[ProductoResponse])
def list_products(
    categoria_id: int | None = Query(default=None),
    buscar: str | None = Query(default=None, min_length=1),
    solo_disponibles: bool = Query(default=False),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    query = db.query(Producto)
    if categoria_id is not None:
        query = query.filter(Producto.categoria_id == categoria_id)
    if buscar:
        search = f"%{buscar.strip()}%"
        query = query.filter(
            (Producto.nombre.ilike(search)) | (Producto.codigo.ilike(search))
        )
    if solo_disponibles:
        query = query.filter(Producto.disponible.is_(True))
    products = query.order_by(Producto.nombre).all()
    return [serialize_product(product) for product in products]


def get_category(db: Session, category_id: int) -> Categoria:
    category = db.query(Categoria).filter_by(id=category_id).first()
    if not category:
        raise HTTPException(status_code=400, detail="Categoría no encontrada")
    return category


def ensure_unique_code(db: Session, code: str | None, product_id: int | None = None):
    if code is None:
        return
    query = db.query(Producto).filter(Producto.codigo == code)
    if product_id is not None:
        query = query.filter(Producto.id != product_id)
    if query.first():
        raise HTTPException(status_code=409, detail="Ya existe un producto con ese código")


@router.post(
    "/productos",
    response_model=ProductoResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_product(
    data: ProductoCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    get_category(db, data.categoria_id)
    ensure_unique_code(db, data.codigo)
    product = Producto(**data.model_dump())
    db.add(product)
    db.flush()
    db.add(Auditoria(
        event_type="producto_creado",
        actor_id=admin.id,
        details=f"Producto {product.id} creado: {product.nombre}",
    ))
    db.commit()
    db.refresh(product)
    return serialize_product(product)


@router.put("/productos/{product_id}", response_model=ProductoResponse)
def update_product(
    product_id: int,
    data: ProductoUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    product = db.query(Producto).filter_by(id=product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    changes = data.model_dump(exclude_unset=True)
    if "categoria_id" in changes and changes["categoria_id"] is not None:
        get_category(db, changes["categoria_id"])
    if "codigo" in changes:
        ensure_unique_code(db, changes["codigo"], product.id)
    old_price = product.precio_venta
    for field, value in changes.items():
        setattr(product, field, value)
    db.flush()
    if product.precio_venta != old_price:
        db.add(Auditoria(
            event_type="precio_producto_modificado",
            actor_id=admin.id,
            details=(
                f"Precio producto {product.id} ({product.nombre}): "
                f"{old_price:g} -> {product.precio_venta:g} COP"
            ),
        ))
    db.commit()
    db.refresh(product)
    return serialize_product(product)


@router.patch("/productos/{product_id}/disponibilidad", response_model=ProductoResponse)
def update_product_availability(
    product_id: int,
    disponible: bool,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    product = db.query(Producto).filter_by(id=product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    product.disponible = disponible
    db.commit()
    db.refresh(product)
    return serialize_product(product)
