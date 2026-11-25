import csv
import io
import sqlite3
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload
from app.database.connection import engine, get_db
from app.core.security import require_admin
from app.models.cash import CierreCaja, Gasto
from app.models.catalog import Producto
from app.models.inventory import MateriaPrima
from app.models.sales import DetalleVenta, Pago, Venta
from app.models.user import Auditoria, User
from app.schemas.reportes import (
    AlertasDashboard,
    AlertaProductoAgotado,
    AlertaStockMateriaPrima,
    BackupResponse,
    DashboardResumen,
    MedioPagoResumen,
    ProductoTopResumen,
    VentaDiaria,
)

router = APIRouter(
    tags=["Dashboard y reportes"],
    dependencies=[Depends(require_admin)],
)

PAYMENT_METHODS = ("efectivo", "nequi", "daviplata", "tarjeta", "transferencia")


def _resolve_period(
    fecha_inicio: date | None,
    fecha_fin: date | None,
) -> tuple[date, date, datetime, datetime]:
    end_date = fecha_fin or datetime.now(timezone.utc).date()
    start_date = fecha_inicio or end_date
    if start_date > end_date:
        raise HTTPException(
            status_code=422,
            detail="La fecha de inicio no puede ser posterior a la fecha final",
        )
    start_at = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
    end_at = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=timezone.utc)
    return start_date, end_date, start_at, end_at


def _csv_cell(value):
    if isinstance(value, str) and value.startswith(("=", "+", "-", "@", "\t", "\r")):
        return f"'{value}"
    return value


def _csv_response(rows: list[list], filename: str) -> Response:
    output = io.StringIO(newline="")
    writer = csv.writer(output, delimiter=";", lineterminator="\r\n")
    for row in rows:
        writer.writerow([_csv_cell(value) for value in row])
    return Response(
        content=output.getvalue().encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _backup_database(source_path: Path, backup_directory: Path) -> Path:
    if not source_path.is_file():
        raise FileNotFoundError(f"No se encontró la base de datos: {source_path}")
    backup_directory.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    target_path = backup_directory / f"panaderia_{timestamp}.db"
    suffix = 1
    while target_path.exists():
        target_path = backup_directory / f"panaderia_{timestamp}_{suffix:02d}.db"
        suffix += 1

    source_connection = sqlite3.connect(str(source_path))
    target_connection = sqlite3.connect(str(target_path))
    try:
        source_connection.backup(target_connection)
    except sqlite3.Error:
        target_connection.close()
        source_connection.close()
        if target_path.exists():
            target_path.unlink()
        raise
    target_connection.close()
    source_connection.close()
    return target_path


@router.get("/dashboard/resumen", response_model=DashboardResumen)
def dashboard_summary(
    fecha_inicio: date | None = Query(default=None),
    fecha_fin: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    start_date, end_date, start_at, end_at = _resolve_period(fecha_inicio, fecha_fin)
    paid_sales = db.query(Venta).filter(
        Venta.estado == "pagada",
        Venta.cerrada_en >= start_at,
        Venta.cerrada_en < end_at,
    )
    sales_total = float(paid_sales.with_entities(func.coalesce(func.sum(Venta.total), 0)).scalar() or 0)
    ticket_count = int(paid_sales.with_entities(func.count(Venta.id)).scalar() or 0)
    average_ticket = sales_total / ticket_count if ticket_count else 0

    cost_sold = float(
        db.query(func.coalesce(func.sum(DetalleVenta.cantidad * Producto.costo_estimado), 0))
        .join(Venta, DetalleVenta.venta_id == Venta.id)
        .join(Producto, DetalleVenta.producto_id == Producto.id)
        .filter(
            Venta.estado == "pagada",
            Venta.cerrada_en >= start_at,
            Venta.cerrada_en < end_at,
        )
        .scalar()
        or 0
    )
    operating_expenses = float(
        db.query(func.coalesce(func.sum(Gasto.monto), 0))
        .filter(
            Gasto.anulado.is_(False),
            Gasto.fecha_gasto >= start_at,
            Gasto.fecha_gasto < end_at,
        )
        .scalar()
        or 0
    )
    net_profit = sales_total - cost_sold - operating_expenses
    net_margin = net_profit / sales_total * 100 if sales_total else 0

    daily_totals = {
        str(day): float(amount or 0)
        for day, amount in (
            db.query(func.date(Venta.cerrada_en), func.sum(Venta.total))
            .filter(
                Venta.estado == "pagada",
                Venta.cerrada_en >= start_at,
                Venta.cerrada_en < end_at,
            )
            .group_by(func.date(Venta.cerrada_en))
            .all()
        )
    }
    daily_sales: list[VentaDiaria] = []
    current_day = start_date
    while current_day <= end_date:
        daily_sales.append(VentaDiaria(
            fecha=current_day,
            monto=daily_totals.get(current_day.isoformat(), 0),
        ))
        current_day += timedelta(days=1)

    payment_totals = {
        method: float(amount or 0)
        for method, amount in (
            db.query(Pago.metodo_pago, func.sum(Pago.monto))
            .join(Venta, Pago.venta_id == Venta.id)
            .filter(
                Venta.estado == "pagada",
                Venta.cerrada_en >= start_at,
                Venta.cerrada_en < end_at,
            )
            .group_by(Pago.metodo_pago)
            .all()
        )
    }
    payment_breakdown = [
        MedioPagoResumen(
            metodo_pago=method,
            monto=payment_totals.get(method, 0),
            porcentaje=payment_totals.get(method, 0) / sales_total * 100 if sales_total else 0,
        )
        for method in PAYMENT_METHODS
    ]

    top_rows = (
        db.query(
            Producto.id,
            Producto.nombre,
            func.sum(DetalleVenta.cantidad),
            func.sum(DetalleVenta.subtotal),
            func.sum(DetalleVenta.cantidad * Producto.costo_estimado),
        )
        .join(DetalleVenta, DetalleVenta.producto_id == Producto.id)
        .join(Venta, DetalleVenta.venta_id == Venta.id)
        .filter(
            Venta.estado == "pagada",
            Venta.cerrada_en >= start_at,
            Venta.cerrada_en < end_at,
        )
        .group_by(Producto.id, Producto.nombre)
        .order_by(func.sum(DetalleVenta.cantidad).desc(), func.sum(DetalleVenta.subtotal).desc())
        .limit(5)
        .all()
    )
    top_products = [
        ProductoTopResumen(
            producto_id=product_id,
            nombre=name,
            cantidad_vendida=int(quantity or 0),
            ingresos=float(revenue or 0),
            ganancia_estimada=float((revenue or 0) - (cost or 0)),
        )
        for product_id, name, quantity, revenue, cost in top_rows
    ]

    low_materials = (
        db.query(MateriaPrima)
        .filter(
            MateriaPrima.activo.is_(True),
            MateriaPrima.stock_actual <= MateriaPrima.stock_minimo,
        )
        .order_by(MateriaPrima.stock_actual, MateriaPrima.nombre)
        .all()
    )
    exhausted_products = (
        db.query(Producto)
        .filter(Producto.controlar_stock.is_(True), Producto.stock_actual == 0)
        .order_by(Producto.nombre)
        .all()
    )
    active_cash = db.query(CierreCaja).filter_by(estado="abierta").first()

    return DashboardResumen(
        fecha_inicio=start_date,
        fecha_fin=end_date,
        ventas_totales=sales_total,
        cantidad_tickets=ticket_count,
        ticket_promedio=average_ticket,
        costo_vendido=cost_sold,
        gastos_operativos=operating_expenses,
        utilidad_neta_estimada=net_profit,
        margen_neto=net_margin,
        ventas_por_dia=daily_sales,
        medios_pago=payment_breakdown,
        top_productos=top_products,
        alertas=AlertasDashboard(
            materias_primas_bajas=[
                AlertaStockMateriaPrima(
                    id=material.id,
                    codigo=material.codigo,
                    nombre=material.nombre,
                    unidad_medida=material.unidad_medida,
                    stock_actual=material.stock_actual,
                    stock_minimo=material.stock_minimo,
                )
                for material in low_materials
            ],
            productos_agotados=[
                AlertaProductoAgotado(
                    id=product.id,
                    codigo=product.codigo,
                    nombre=product.nombre,
                )
                for product in exhausted_products
            ],
            estado_caja="abierta" if active_cash else "cerrada",
            caja_consecutivo=active_cash.consecutivo if active_cash else None,
        ),
    )


@router.get("/reportes/exportar-csv")
def export_csv(
    tipo: Literal["ventas", "gastos", "inventario"] = Query(...),
    fecha_inicio: date | None = Query(default=None),
    fecha_fin: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    start_date, end_date, start_at, end_at = _resolve_period(fecha_inicio, fecha_fin)
    if tipo == "ventas":
        sales = (
            db.query(Venta)
            .options(
                selectinload(Venta.detalles).joinedload(DetalleVenta.producto),
                selectinload(Venta.pagos),
            )
            .filter(
                Venta.estado == "pagada",
                Venta.cerrada_en >= start_at,
                Venta.cerrada_en < end_at,
            )
            .order_by(Venta.cerrada_en, Venta.id)
            .all()
        )
        rows = [[
            "Venta",
            "Fecha",
            "Producto",
            "Cantidad",
            "Precio unitario COP",
            "Subtotal COP",
            "Costo estimado COP",
            "Total venta COP",
            "Medios de pago",
        ]]
        for sale in sales:
            payment_methods = ", ".join(sorted({payment.metodo_pago for payment in sale.pagos}))
            for line in sale.detalles:
                rows.append([
                    sale.consecutivo,
                    sale.cerrada_en.isoformat() if sale.cerrada_en else "",
                    line.producto.nombre,
                    line.cantidad,
                    line.precio_unitario,
                    line.subtotal,
                    line.cantidad * line.producto.costo_estimado,
                    sale.total,
                    payment_methods,
                ])
        filename = f"ventas_{start_date:%Y%m%d}_{end_date:%Y%m%d}.csv"
        return _csv_response(rows, filename)

    if tipo == "gastos":
        expenses = (
            db.query(Gasto)
            .options(joinedload(Gasto.usuario), joinedload(Gasto.cierre_caja))
            .filter(Gasto.fecha_gasto >= start_at, Gasto.fecha_gasto < end_at)
            .order_by(Gasto.fecha_gasto, Gasto.id)
            .all()
        )
        rows = [[
            "Gasto",
            "Fecha",
            "Categoría",
            "Descripción",
            "Monto COP",
            "Medio de pago",
            "Comprobante",
            "Caja",
            "Responsable",
            "Anulado",
        ]]
        rows.extend([
            expense.consecutivo,
            expense.fecha_gasto.isoformat(),
            expense.categoria,
            expense.descripcion,
            expense.monto,
            expense.metodo_pago,
            expense.comprobante_ref or "",
            expense.cierre_caja.consecutivo if expense.cierre_caja else "",
            expense.usuario.full_name,
            "Sí" if expense.anulado else "No",
        ] for expense in expenses)
        filename = f"gastos_{start_date:%Y%m%d}_{end_date:%Y%m%d}.csv"
        return _csv_response(rows, filename)

    materials = db.query(MateriaPrima).order_by(MateriaPrima.nombre).all()
    products = db.query(Producto).order_by(Producto.nombre).all()
    rows = [[
        "Tipo",
        "Código",
        "Artículo",
        "Unidad",
        "Stock actual",
        "Stock mínimo",
        "Costo unitario COP",
        "Valor estimado COP",
        "Activo",
    ]]
    rows.extend([
        "Materia prima",
        material.codigo or "",
        material.nombre,
        material.unidad_medida,
        material.stock_actual,
        material.stock_minimo,
        material.costo_promedio,
        material.stock_actual * material.costo_promedio,
        "Sí" if material.activo else "No",
    ] for material in materials)
    rows.extend([
        "Producto",
        product.codigo or "",
        product.nombre,
        "unidad",
        product.stock_actual,
        "",
        product.costo_estimado,
        product.stock_actual * product.costo_estimado,
        "Sí" if product.disponible else "No",
    ] for product in products)
    return _csv_response(rows, f"inventario_{datetime.now():%Y%m%d}.csv")


@router.post("/sistema/backup", response_model=BackupResponse)
def backup_database(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if engine.dialect.name != "sqlite":
        raise HTTPException(
            status_code=501,
            detail="Use los respaldos administrados por su proveedor de PostgreSQL.",
        )
    database_path = Path(engine.url.database).resolve()
    project_directory = (
        database_path.parent.parent
        if database_path.parent.name.casefold() == "data"
        else database_path.parent
    )
    try:
        backup_path = _backup_database(database_path, project_directory / "backups")
    except FileNotFoundError as error:
        raise HTTPException(status_code=500, detail=str(error))
    except (OSError, sqlite3.Error) as error:
        raise HTTPException(status_code=500, detail=f"No fue posible crear el respaldo: {error}")
    db.add(Auditoria(
        event_type="respaldo_base_datos",
        actor_id=admin.id,
        details=f"Respaldo de base de datos creado: {backup_path.name}",
    ))
    db.commit()
    return BackupResponse(
        nombre_archivo=backup_path.name,
        mensaje="Copia de seguridad creada correctamente",
    )
