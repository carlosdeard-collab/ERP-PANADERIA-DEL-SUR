from datetime import date
from pydantic import BaseModel


class VentaDiaria(BaseModel):
    fecha: date
    monto: float


class MedioPagoResumen(BaseModel):
    metodo_pago: str
    monto: float
    porcentaje: float


class ProductoTopResumen(BaseModel):
    producto_id: int
    nombre: str
    cantidad_vendida: int
    ingresos: float
    ganancia_estimada: float


class AlertaStockMateriaPrima(BaseModel):
    id: int
    codigo: str | None
    nombre: str
    unidad_medida: str
    stock_actual: float
    stock_minimo: float


class AlertaProductoAgotado(BaseModel):
    id: int
    codigo: str | None
    nombre: str


class AlertasDashboard(BaseModel):
    materias_primas_bajas: list[AlertaStockMateriaPrima]
    productos_agotados: list[AlertaProductoAgotado]
    estado_caja: str
    caja_consecutivo: str | None


class DashboardResumen(BaseModel):
    fecha_inicio: date
    fecha_fin: date
    ventas_totales: float
    cantidad_tickets: int
    ticket_promedio: float
    costo_vendido: float
    gastos_operativos: float
    utilidad_neta_estimada: float
    margen_neto: float
    ventas_por_dia: list[VentaDiaria]
    medios_pago: list[MedioPagoResumen]
    top_productos: list[ProductoTopResumen]
    alertas: AlertasDashboard


class BackupResponse(BaseModel):
    nombre_archivo: str
    mensaje: str
