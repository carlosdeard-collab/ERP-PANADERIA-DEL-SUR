from sqlalchemy import inspect
from sqlalchemy.orm import Session
from app.database.connection import Base, engine, SessionLocal
from app.models.user import Role, User
from app.models.catalog import Categoria, Producto
from app.models.sales import Mesa
from app.models.inventory import MateriaPrima, MovimientoInventario, Proveedor
from app.models.production import DetalleReceta, Receta
from app.models.cash import CierreCaja, Gasto
from app.core.security import hash_password

def initialize_database():
    Base.metadata.create_all(bind=engine)
    detail_columns = {
        column["name"] for column in inspect(engine).get_columns("detalle_ventas")
    }
    if "stock_descontado" not in detail_columns:
        default_value = "FALSE" if engine.dialect.name == "postgresql" else "0"
        with engine.begin() as connection:
            connection.exec_driver_sql(
                "ALTER TABLE detalle_ventas "
                f"ADD COLUMN stock_descontado BOOLEAN NOT NULL DEFAULT {default_value}"
            )
    db: Session = SessionLocal()
    try:
        for name, description in [
            ("administradora", "Acceso administrativo completo"),
            ("mesera", "Operación de mesas y ventas autorizadas"),
        ]:
            if not db.query(Role).filter_by(name=name).first():
                db.add(Role(name=name, description=description))
        db.commit()

        initial_users = [
            (
                "admin",
                "Administradora",
                "Admin123!Cambiar",
                "administradora",
            ),
            (
                "mesera",
                "Mesera",
                "Mesera123!",
                "mesera",
            ),
        ]
        for username, full_name, password, role_name in initial_users:
            if not db.query(User).filter_by(username=username).first():
                role = db.query(Role).filter_by(name=role_name).one()
                db.add(User(
                    username=username,
                    full_name=full_name,
                    password_hash=hash_password(password),
                    role_id=role.id,
                ))
        db.commit()

        if not db.query(Categoria).first():
            categories = [
                Categoria(nombre="Panadería", descripcion="Panes tradicionales y salados"),
                Categoria(nombre="Pastelería y Repostería", descripcion="Pasteles y productos de repostería"),
                Categoria(nombre="Bebidas Calientes", descripcion="Café, chocolate e infusiones"),
                Categoria(nombre="Bebidas Frías", descripcion="Jugos y bebidas frías"),
                Categoria(nombre="Cafetería y Desayunos", descripcion="Desayunos y productos de cafetería"),
            ]
            db.add_all(categories)
            db.flush()
            category_ids = {category.nombre: category.id for category in categories}
            examples = [
                ("PAN-001", "Pan de Bono", "Panadería", 2500, 30, True),
                ("PAN-002", "Almojábana", "Panadería", 2500, 25, True),
                ("PAN-003", "Pan Blandito", "Panadería", 600, 60, True),
                ("PAS-001", "Croissant de Queso", "Pastelería y Repostería", 4000, 15, True),
                ("BCA-001", "Tinto", "Bebidas Calientes", 2000, 0, False),
                ("BCA-002", "Café con Leche", "Bebidas Calientes", 3500, 0, False),
                ("BCA-003", "Chocolate en Leche", "Bebidas Calientes", 4500, 0, False),
                ("BFR-001", "Jugo Natural en Agua", "Bebidas Frías", 5000, 0, False),
            ]
            db.add_all([
                Producto(
                    codigo=code,
                    nombre=name,
                    categoria_id=category_ids[category],
                    precio_venta=price,
                    stock_actual=stock,
                    controlar_stock=controls_stock,
                )
                for code, name, category, price, stock, controls_stock in examples
            ])
            db.commit()

        if not db.query(Mesa).first():
            db.add_all([
                Mesa(numero=number, nombre=f"Mesa {number}", capacidad=4)
                for number in range(1, 9)
            ])
            db.commit()

        if not db.query(Proveedor).first():
            db.add_all([
                Proveedor(
                    nombre="Harinera del Llano S.A.S.",
                    nit_documento="900123456-1",
                    telefono="601 555 0101",
                    contacto="Ventas mayoristas",
                ),
                Proveedor(
                    nombre="Lácteos y Quesos El Corral",
                    nit_documento="900234567-2",
                    telefono="601 555 0102",
                    contacto="Pedidos lácteos",
                ),
                Proveedor(
                    nombre="Distribuidora Insumos Panaderos",
                    nit_documento="900345678-3",
                    telefono="601 555 0103",
                    contacto="Servicio al cliente",
                ),
            ])
            db.commit()

        if not db.query(MateriaPrima).first():
            initial_inventory = [
                ("MP-001", "Harina de Trigo Fortificada", "kg", 45, 10, 3200),
                ("MP-002", "Almidón de Yuca", "kg", 12, 3, 5200),
                ("MP-003", "Queso Costeño", "kg", 10, 2, 19000),
                ("MP-004", "Mantequilla", "kg", 8, 2, 18000),
                ("MP-005", "Azúcar Blanca", "kg", 20, 5, 4200),
                ("MP-006", "Levadura Fresca", "g", 2000, 500, 12),
                ("MP-007", "Huevos AA", "unidad", 120, 30, 650),
                ("MP-008", "Leche Entera", "l", 25, 6, 4200),
                ("MP-009", "Café Molido", "kg", 6, 1, 34000),
            ]
            admin = db.query(User).filter_by(username="admin").one()
            materials = [
                MateriaPrima(
                    codigo=code,
                    nombre=name,
                    unidad_medida=unit,
                    stock_actual=stock,
                    stock_minimo=minimum,
                    costo_promedio=cost,
                )
                for code, name, unit, stock, minimum, cost in initial_inventory
            ]
            db.add_all(materials)
            db.flush()
            db.add_all([
                MovimientoInventario(
                    tipo_item="materia_prima",
                    materia_prima_id=material.id,
                    tipo_movimiento="ajuste_positivo",
                    cantidad=material.stock_actual,
                    stock_anterior=0,
                    stock_nuevo=material.stock_actual,
                    costo_unitario=material.costo_promedio,
                    referencia="Inventario inicial",
                    usuario_id=admin.id,
                )
                for material in materials
            ])
            db.commit()

        if not db.query(Receta).first():
            products = {
                product.nombre: product
                for product in db.query(Producto).filter(
                    Producto.nombre.in_(["Pan de Bono", "Almojábana"])
                ).all()
            }
            materials = {
                material.nombre: material
                for material in db.query(MateriaPrima).filter(
                    MateriaPrima.nombre.in_([
                        "Almidón de Yuca",
                        "Queso Costeño",
                        "Harina de Trigo Fortificada",
                        "Mantequilla",
                        "Huevos AA",
                    ])
                ).all()
            }
            recipe_ingredients = {
                "Pan de Bono": [
                    ("Almidón de Yuca", 2.0),
                    ("Queso Costeño", 1.5),
                    ("Harina de Trigo Fortificada", 0.5),
                    ("Mantequilla", 0.5),
                    ("Huevos AA", 10.0),
                ],
                "Almojábana": [
                    ("Almidón de Yuca", 1.0),
                    ("Queso Costeño", 1.6),
                    ("Harina de Trigo Fortificada", 1.0),
                    ("Mantequilla", 0.3),
                    ("Huevos AA", 8.0),
                ],
            }
            if len(products) == 2 and len(materials) == 5:
                for product_name, yield_units, instructions in [
                    (
                        "Pan de Bono",
                        50,
                        "Mezclar almidón y harina con queso, mantequilla y huevo; formar y hornear.",
                    ),
                    (
                        "Almojábana",
                        40,
                        "Integrar los ingredientes, formar porciones uniformes y hornear.",
                    ),
                ]:
                    recipe = Receta(
                        producto=products[product_name],
                        nombre=f"Fórmula {product_name} Tradicional",
                        rendimiento_unidades=yield_units,
                        instrucciones=instructions,
                    )
                    recipe.detalles = [
                        DetalleReceta(
                            materia_prima=materials[material_name],
                            cantidad_requerida=quantity,
                        )
                        for material_name, quantity in recipe_ingredients[product_name]
                    ]
                    db.add(recipe)
                db.commit()
    finally:
        db.close()
