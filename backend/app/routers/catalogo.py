from decimal import Decimal, InvalidOperation
from io import BytesIO
import math
from pathlib import Path
import re
import unicodedata
from zipfile import BadZipFile

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils.exceptions import InvalidFileException
from openpyxl.worksheet.datavalidation import DataValidation
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

PRODUCT_HEADERS = {
    "nombre": "nombre",
    "categoria": "categoria",
    "precioventa": "precio_venta",
    "precio": "precio_venta",
    "costo": "costo_estimado",
    "costoestimado": "costo_estimado",
    "activo": "disponible",
    "activa": "disponible",
    "disponible": "disponible",
}


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


def normalize_text(value: object) -> str:
    text = "" if value is None else str(value)
    decomposed = unicodedata.normalize("NFKD", text)
    unaccented = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(unaccented.casefold().split())


def normalize_header(value: object) -> str:
    return "".join(char for char in normalize_text(value) if char.isalnum())


def parse_money(value: object, field_name: str) -> float:
    if isinstance(value, bool) or value is None:
        raise ValueError(f"{field_name} debe ser un valor numérico")
    if isinstance(value, (int, float, Decimal)):
        amount_text = str(value)
    else:
        amount_text = str(value).strip().upper()
        amount_text = amount_text.replace("COP", "").replace("COL$", "").replace("$", "")
        amount_text = re.sub(r"\s+", "", amount_text)
        if not amount_text:
            raise ValueError(f"{field_name} debe ser un valor numérico")
        if not re.fullmatch(r"[\d.,+-]+", amount_text):
            raise ValueError(f"{field_name} contiene caracteres no válidos")

        if "," in amount_text and "." in amount_text:
            decimal_separator = "," if amount_text.rfind(",") > amount_text.rfind(".") else "."
            grouping_separator = "." if decimal_separator == "," else ","
            amount_text = amount_text.replace(grouping_separator, "")
            amount_text = amount_text.replace(decimal_separator, ".")
        elif "," in amount_text or "." in amount_text:
            separator = "," if "," in amount_text else "."
            pieces = amount_text.split(separator)
            if len(pieces) > 2:
                amount_text = "".join(pieces)
            elif len(pieces[-1]) == 3:
                amount_text = "".join(pieces)
            else:
                amount_text = f"{pieces[0]}.{pieces[1]}"

    try:
        amount = Decimal(amount_text)
    except InvalidOperation as error:
        raise ValueError(f"{field_name} debe ser un valor numérico") from error
    numeric_amount = float(amount)
    if not amount.is_finite() or not math.isfinite(numeric_amount) or amount < 0:
        raise ValueError(f"{field_name} debe ser un número mayor o igual a cero")
    return numeric_amount


def parse_active(value: object) -> bool | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    if isinstance(value, bool):
        return value
    normalized = normalize_text(value)
    if normalized in {"si", "s", "true", "1", "activo", "activa"}:
        return True
    if normalized in {"no", "n", "false", "0", "inactivo", "inactiva"}:
        return False
    raise ValueError("Activo debe ser SI o NO")


def build_catalog_template() -> BytesIO:
    workbook = Workbook()
    products = workbook.active
    if products is None:
        products = workbook.create_sheet("Productos")
    else:
        products.title = "Productos"
    products.append(["Nombre", "Categoria", "Precio_Venta", "Costo", "Activo"])
    products.append(["Pan de Bono", "Panadería", 2500, 1000, "SI"])
    products.append(["Croissant de Mantequilla", "Pastelería y Repostería", 4500, 1800, "SI"])
    products.append(["Café con Leche", "Bebidas Calientes", 3500, 1200, "SI"])
    products.append(["Torta de Chocolate", "Pastelería y Repostería", 6000, 2500, "SI"])
    products.freeze_panes = "A2"
    products.auto_filter.ref = products.dimensions
    products.column_dimensions["A"].width = 32
    products.column_dimensions["B"].width = 30
    products.column_dimensions["C"].width = 18
    products.column_dimensions["D"].width = 16
    products.column_dimensions["E"].width = 12
    for cell in products[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="5B382D")
        cell.alignment = Alignment(horizontal="center")
    for row in products.iter_rows(min_row=2, min_col=3, max_col=4):
        for cell in row:
            cell.number_format = '"$" #,##0'

    instructions = workbook.create_sheet("Instrucciones")
    instructions.append(["Guía de importación del catálogo"])
    instructions.append(["Columnas obligatorias: Nombre, Categoria y Precio_Venta."])
    instructions.append(["Costo es opcional; si se deja vacío, los productos nuevos usan 0 y los existentes conservan su costo."])
    instructions.append(["Activo es opcional; escriba SI o NO. Si se deja vacío, los nuevos usan SI y los existentes conservan su estado."])
    instructions.append(["Las categorías que no existan se crearán automáticamente."])
    instructions.append(["Los productos nuevos se crean sin control de stock, ya que la plantilla no incluye existencias."])
    instructions.append(["Los valores monetarios pueden ser números o texto como $ 3.500 o 3,500."])
    instructions.column_dimensions["A"].width = 100
    instructions["A1"].font = Font(bold=True, color="FFFFFF", size=14)
    instructions["A1"].fill = PatternFill("solid", fgColor="5B382D")
    for row in instructions.iter_rows(min_row=1, max_col=1):
        row[0].alignment = Alignment(wrap_text=True, vertical="top")

    active_validation = DataValidation(type="list", formula1='"SI,NO"', allow_blank=True)
    products.add_data_validation(active_validation)
    active_validation.add("E2:E5000")

    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return output


@router.get("/catalogo/plantilla-excel")
def download_catalog_template(_admin: User = Depends(require_admin)):
    return StreamingResponse(
        build_catalog_template(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="plantilla_catalogo.xlsx"'},
    )


@router.post("/catalogo/importar-excel")
def import_catalog_excel(
    file: UploadFile = File(...),
    actualizar_existentes: bool = Query(default=True),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if Path(file.filename or "").suffix.casefold() != ".xlsx":
        raise HTTPException(status_code=400, detail="El archivo debe tener formato .xlsx")

    try:
        workbook = load_workbook(BytesIO(file.file.read()), data_only=True, read_only=True)
    except (BadZipFile, InvalidFileException, OSError, KeyError) as error:
        raise HTTPException(status_code=400, detail="El archivo Excel está dañado o no es válido") from error

    sheet = workbook["Productos"] if "Productos" in workbook.sheetnames else workbook.active
    if sheet is None:
        workbook.close()
        raise HTTPException(status_code=400, detail="El archivo Excel no contiene hojas")
    header_row = next(sheet.iter_rows(min_row=1, max_row=1, values_only=True), None)
    if header_row is None:
        workbook.close()
        raise HTTPException(status_code=400, detail="El archivo Excel no contiene encabezados")

    column_indexes = {
        PRODUCT_HEADERS[normalize_header(value)]: index
        for index, value in enumerate(header_row)
        if normalize_header(value) in PRODUCT_HEADERS
    }
    required_columns = {"nombre", "categoria", "precio_venta"}
    if not required_columns.issubset(column_indexes):
        workbook.close()
        raise HTTPException(
            status_code=400,
            detail="Faltan columnas obligatorias: Nombre, Categoria y Precio_Venta",
        )

    categories = {
        normalize_text(category.nombre): category
        for category in db.query(Categoria).all()
    }
    products = {
        normalize_text(product.nombre): product
        for product in db.query(Producto).all()
    }
    created = updated = skipped = 0
    errors: list[dict[str, int | str]] = []

    try:
        for row_number, row in enumerate(sheet.iter_rows(min_row=2, values_only=True), start=2):
            if all(value is None or (isinstance(value, str) and not value.strip()) for value in row):
                continue

            def value_for(column: str) -> object:
                index = column_indexes.get(column)
                return row[index] if index is not None and index < len(row) else None

            raw_name = value_for("nombre")
            product_name = "" if raw_name is None else str(raw_name).strip()
            try:
                if len(product_name) < 2 or len(product_name) > 150:
                    raise ValueError("Nombre debe tener entre 2 y 150 caracteres")
                raw_category = value_for("categoria")
                category_name = "" if raw_category is None else str(raw_category).strip()
                if len(category_name) < 2 or len(category_name) > 100:
                    raise ValueError("Categoria debe tener entre 2 y 100 caracteres")
                price = parse_money(value_for("precio_venta"), "Precio_Venta")
                raw_cost = value_for("costo_estimado")
                cost = None if raw_cost is None or (isinstance(raw_cost, str) and not raw_cost.strip()) else parse_money(raw_cost, "Costo")
                available = parse_active(value_for("disponible"))
            except ValueError as error:
                errors.append({
                    "fila": row_number,
                    "producto": product_name,
                    "motivo": str(error),
                })
                continue

            product_key = normalize_text(product_name)
            product = products.get(product_key)
            if product is not None and not actualizar_existentes:
                skipped += 1
                continue

            category_key = normalize_text(category_name)
            category = categories.get(category_key)
            if category is None:
                category = Categoria(nombre=category_name, activa=True)
                db.add(category)
                db.flush()
                categories[category_key] = category

            if product is None:
                product = Producto(
                    nombre=product_name,
                    categoria_id=category.id,
                    precio_venta=price,
                    costo_estimado=cost if cost is not None else 0,
                    controlar_stock=False,
                    disponible=available if available is not None else True,
                )
                db.add(product)
                products[product_key] = product
                created += 1
            else:
                product.categoria_id = category.id
                product.precio_venta = price
                if cost is not None:
                    product.costo_estimado = cost
                if available is not None:
                    product.disponible = available
                updated += 1

        db.add(Auditoria(
            event_type="catalogo_excel_importado",
            actor_id=admin.id,
            details=f"Importación Excel: {created} creados, {updated} actualizados, {skipped} omitidos, {len(errors)} errores",
        ))
        db.commit()
    finally:
        workbook.close()

    return {
        "creados": created,
        "actualizados": updated,
        "omitidos": skipped,
        "errores": errors,
    }


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
