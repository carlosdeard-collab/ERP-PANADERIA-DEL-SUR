from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session
from app.core.security import require_admin
from app.database.connection import get_db
from app.models.catalog import Producto
from app.models.inventory import MateriaPrima, MovimientoInventario
from app.models.production import (
    DetalleProduccion,
    DetalleReceta,
    Produccion,
    Receta,
)
from app.models.user import Auditoria, User
from app.schemas.produccion import (
    DetalleProduccionResponse,
    IngredienteRecetaResponse,
    ProduccionCreate,
    ProduccionResponse,
    RecetaInput,
    RecetaResponse,
)

router = APIRouter(
    tags=["Producción"],
    dependencies=[Depends(require_admin)],
)


def serialize_recipe(recipe: Receta) -> RecetaResponse:
    ingredients = [
        IngredienteRecetaResponse(
            materia_prima_id=line.materia_prima_id,
            materia_prima_nombre=line.materia_prima.nombre,
            unidad_medida=line.materia_prima.unidad_medida,
            cantidad_requerida=line.cantidad_requerida,
            costo_unitario=line.materia_prima.costo_promedio,
            costo_parcial=line.cantidad_requerida * line.materia_prima.costo_promedio,
        )
        for line in recipe.detalles
    ]
    batch_cost = sum(line.costo_parcial for line in ingredients)
    unit_cost = batch_cost / recipe.rendimiento_unidades
    sale_price = recipe.producto.precio_venta
    margin = ((sale_price - unit_cost) / sale_price * 100) if sale_price > 0 else 0
    return RecetaResponse(
        id=recipe.id,
        producto_id=recipe.producto_id,
        producto_nombre=recipe.producto.nombre,
        precio_venta=sale_price,
        nombre=recipe.nombre,
        rendimiento_unidades=recipe.rendimiento_unidades,
        instrucciones=recipe.instrucciones,
        activa=recipe.activa,
        creado_en=recipe.creado_en,
        costo_lote=batch_cost,
        costo_unitario_estimado=unit_cost,
        margen_bruto_estimado=margin,
        ingredientes=ingredients,
    )


def serialize_production(production: Produccion) -> ProduccionResponse:
    return ProduccionResponse(
        id=production.id,
        consecutivo=production.consecutivo,
        receta_id=production.receta_id,
        receta_nombre=production.receta.nombre,
        producto_id=production.producto_id,
        producto_nombre=production.producto.nombre,
        lotes_producidos=production.lotes_producidos,
        cantidad_esperada=production.cantidad_esperada,
        cantidad_buena=production.cantidad_buena,
        cantidad_merma=production.cantidad_merma,
        costo_total_insumos=production.costo_total_insumos,
        costo_unitario_real=production.costo_unitario_real,
        observaciones=production.observaciones,
        usuario_id=production.usuario_id,
        usuario_nombre=production.usuario.full_name,
        fecha_produccion=production.fecha_produccion,
        anulada=production.anulada,
        ingredientes=[
            DetalleProduccionResponse(
                materia_prima_id=line.materia_prima_id,
                materia_prima_nombre=line.materia_prima.nombre,
                unidad_medida=line.materia_prima.unidad_medida,
                cantidad_consumida=line.cantidad_consumida,
                costo_unitario=line.costo_unitario,
                costo_parcial=line.cantidad_consumida * line.costo_unitario,
            )
            for line in production.detalles
        ],
    )


def validate_recipe_data(db: Session, data: RecetaInput, recipe_id: int | None = None):
    product = db.query(Producto).filter_by(id=data.producto_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    duplicate = db.query(Receta).filter(Receta.producto_id == data.producto_id)
    if recipe_id is not None:
        duplicate = duplicate.filter(Receta.id != recipe_id)
    if duplicate.first():
        raise HTTPException(status_code=409, detail="El producto ya tiene una receta")

    material_ids = {line.materia_prima_id for line in data.ingredientes}
    materials = {
        material.id: material
        for material in db.query(MateriaPrima).filter(
            MateriaPrima.id.in_(material_ids),
            MateriaPrima.activo.is_(True),
        ).all()
    }
    missing = material_ids - materials.keys()
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Materias primas inexistentes o inactivas: {', '.join(map(str, sorted(missing)))}",
        )
    return product, materials


def add_movement(
    db: Session,
    *,
    item_type: str,
    quantity: float,
    previous_stock: float,
    new_stock: float,
    reference: str,
    user_id: int,
    unit_cost: float,
    material_id: int | None = None,
    product_id: int | None = None,
    movement_type: str,
) -> None:
    db.add(MovimientoInventario(
        tipo_item=item_type,
        materia_prima_id=material_id,
        producto_id=product_id,
        tipo_movimiento=movement_type,
        cantidad=quantity,
        stock_anterior=previous_stock,
        stock_nuevo=new_stock,
        costo_unitario=unit_cost,
        referencia=reference,
        usuario_id=user_id,
    ))


@router.get("/recetas", response_model=list[RecetaResponse])
def list_recipes(db: Session = Depends(get_db)):
    recipes = db.query(Receta).order_by(Receta.nombre).all()
    return [serialize_recipe(recipe) for recipe in recipes]


@router.post(
    "/recetas",
    response_model=RecetaResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_recipe(
    data: RecetaInput,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    product, materials = validate_recipe_data(db, data)
    recipe = Receta(
        producto=product,
        nombre=data.nombre.strip(),
        rendimiento_unidades=data.rendimiento_unidades,
        instrucciones=data.instrucciones,
        activa=data.activa,
        detalles=[
            DetalleReceta(
                materia_prima=materials[line.materia_prima_id],
                cantidad_requerida=line.cantidad_requerida,
            )
            for line in data.ingredientes
        ],
    )
    db.add(recipe)
    db.add(Auditoria(
        event_type="receta_creada",
        actor_id=admin.id,
        details=f"Receta creada: {recipe.nombre} ({product.nombre})",
    ))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ya existe una receta para ese producto")
    db.refresh(recipe)
    return serialize_recipe(recipe)


@router.put("/recetas/{recipe_id}", response_model=RecetaResponse)
def update_recipe(
    recipe_id: int,
    data: RecetaInput,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    recipe = db.query(Receta).filter_by(id=recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Receta no encontrada")
    product, materials = validate_recipe_data(db, data, recipe.id)
    recipe.producto = product
    recipe.nombre = data.nombre.strip()
    recipe.rendimiento_unidades = data.rendimiento_unidades
    recipe.instrucciones = data.instrucciones
    recipe.activa = data.activa
    recipe.detalles.clear()
    db.flush()
    recipe.detalles = [
        DetalleReceta(
            materia_prima=materials[line.materia_prima_id],
            cantidad_requerida=line.cantidad_requerida,
        )
        for line in data.ingredientes
    ]
    db.add(Auditoria(
        event_type="receta_modificada",
        actor_id=admin.id,
        details=f"Receta modificada: {recipe.nombre} ({product.nombre})",
    ))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="No fue posible guardar la receta")
    db.refresh(recipe)
    return serialize_recipe(recipe)


@router.get("/producciones", response_model=list[ProduccionResponse])
def list_productions(
    fecha: date | None = Query(default=None),
    producto_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
):
    query = db.query(Produccion)
    if fecha is not None:
        query = query.filter(func.date(Produccion.fecha_produccion) == fecha.isoformat())
    if producto_id is not None:
        query = query.filter(Produccion.producto_id == producto_id)
    productions = query.order_by(Produccion.fecha_produccion.desc()).all()
    return [serialize_production(row) for row in productions]


@router.post(
    "/producciones",
    response_model=ProduccionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_production(
    data: ProduccionCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    recipe = db.query(Receta).filter_by(id=data.receta_id, activa=True).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Receta no encontrada o inactiva")
    product = db.query(Producto).filter_by(id=recipe.producto_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto de la receta no encontrado")

    expected = int(
        (Decimal(str(data.lotes_producidos)) * recipe.rendimiento_unidades).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
    )
    if expected < 1:
        raise HTTPException(status_code=422, detail="Los lotes deben producir al menos una unidad")
    if data.cantidad_buena + data.cantidad_merma > expected:
        raise HTTPException(
            status_code=422,
            detail=f"Unidades buenas y merma no pueden superar el rendimiento esperado ({expected})",
        )

    consumptions: list[tuple[MateriaPrima, float, float]] = []
    shortages: list[str] = []
    for line in recipe.detalles:
        material = line.materia_prima
        if not material.activo:
            raise HTTPException(
                status_code=409,
                detail=f"La materia prima {material.nombre} está inactiva en la receta",
            )
        required = line.cantidad_requerida * data.lotes_producidos
        if material.stock_actual < required:
            shortages.append(
                f"{material.nombre}: requiere {required:g} {material.unidad_medida}, "
                f"disponible {material.stock_actual:g}, faltan {required - material.stock_actual:g}"
            )
        consumptions.append((material, required, material.costo_promedio))
    if shortages:
        raise HTTPException(
            status_code=400,
            detail="Stock insuficiente: " + "; ".join(shortages),
        )

    total_cost = sum(quantity * unit_cost for _, quantity, unit_cost in consumptions)
    production = Produccion(
        consecutivo="",
        receta_id=recipe.id,
        producto_id=product.id,
        lotes_producidos=data.lotes_producidos,
        cantidad_esperada=expected,
        cantidad_buena=data.cantidad_buena,
        cantidad_merma=data.cantidad_merma,
        costo_total_insumos=total_cost,
        costo_unitario_real=total_cost / data.cantidad_buena,
        observaciones=data.observaciones.strip() if data.observaciones else None,
        usuario_id=admin.id,
    )
    db.add(production)
    db.flush()
    production.consecutivo = f"P-{production.id:04d}"

    for material, quantity, unit_cost in consumptions:
        previous = material.stock_actual
        material.stock_actual -= quantity
        production.detalles.append(DetalleProduccion(
            materia_prima=material,
            cantidad_consumida=quantity,
            costo_unitario=unit_cost,
        ))
        add_movement(
            db,
            item_type="materia_prima",
            material_id=material.id,
            movement_type="salida_produccion",
            quantity=quantity,
            previous_stock=previous,
            new_stock=material.stock_actual,
            reference=production.consecutivo,
            user_id=admin.id,
            unit_cost=unit_cost,
        )

    previous_product_stock = product.stock_actual
    product.stock_actual += data.cantidad_buena
    product.costo_estimado = production.costo_unitario_real
    add_movement(
        db,
        item_type="producto",
        product_id=product.id,
        movement_type="entrada_produccion",
        quantity=data.cantidad_buena,
        previous_stock=previous_product_stock,
        new_stock=product.stock_actual,
        reference=production.consecutivo,
        user_id=admin.id,
        unit_cost=production.costo_unitario_real,
    )
    db.add(Auditoria(
        event_type="produccion_registrada",
        actor_id=admin.id,
        details=(
            f"Producción {production.consecutivo}: {data.cantidad_buena} unidades de "
            f"{product.nombre}; costo {total_cost:g} COP"
        ),
    ))
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise
    db.refresh(production)
    return serialize_production(production)


@router.post("/producciones/{production_id}/anular", response_model=ProduccionResponse)
def cancel_production(
    production_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    production = db.query(Produccion).filter_by(id=production_id).first()
    if not production:
        raise HTTPException(status_code=404, detail="Producción no encontrada")
    if production.anulada:
        raise HTTPException(status_code=409, detail="La producción ya fue anulada")
    product = production.producto
    if product.stock_actual < production.cantidad_buena:
        raise HTTPException(
            status_code=409,
            detail=(
                f"No se puede anular: {product.nombre} tiene {product.stock_actual} unidades "
                f"en vitrina y se deben retirar {production.cantidad_buena}"
            ),
        )

    reference = f"Anulación {production.consecutivo}"
    for line in production.detalles:
        material = line.materia_prima
        previous = material.stock_actual
        material.stock_actual += line.cantidad_consumida
        add_movement(
            db,
            item_type="materia_prima",
            material_id=material.id,
            movement_type="ajuste_positivo",
            quantity=line.cantidad_consumida,
            previous_stock=previous,
            new_stock=material.stock_actual,
            reference=reference,
            user_id=admin.id,
            unit_cost=line.costo_unitario,
        )

    previous_product_stock = product.stock_actual
    product.stock_actual -= production.cantidad_buena
    add_movement(
        db,
        item_type="producto",
        product_id=product.id,
        movement_type="ajuste_negativo",
        quantity=production.cantidad_buena,
        previous_stock=previous_product_stock,
        new_stock=product.stock_actual,
        reference=reference,
        user_id=admin.id,
        unit_cost=production.costo_unitario_real,
    )
    production.anulada = True
    db.add(Auditoria(
        event_type="produccion_anulada",
        actor_id=admin.id,
        details=f"Producción {production.consecutivo} anulada",
    ))
    db.commit()
    db.refresh(production)
    return serialize_production(production)
