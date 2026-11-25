from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field

CategoriaGasto = Literal[
    "servicios_publicos",
    "gas_horno",
    "arriendo",
    "nomina",
    "aseo_empaques",
    "mantenimiento",
    "otros",
]
MetodoGasto = Literal["efectivo_caja", "transferencia", "nequi", "daviplata", "otro"]


class AperturaCaja(BaseModel):
    base_inicial: float = Field(ge=0, allow_inf_nan=False)
    observaciones: str | None = Field(default=None, max_length=1000)


class CierreCajaInput(BaseModel):
    efectivo_contado: float = Field(ge=0, allow_inf_nan=False)
    observaciones: str | None = Field(default=None, max_length=1000)


class CierreCajaResponse(BaseModel):
    id: int
    consecutivo: str
    usuario_apertura_id: int
    usuario_apertura_nombre: str
    usuario_cierre_id: int | None
    usuario_cierre_nombre: str | None
    estado: str
    fecha_apertura: datetime
    fecha_cierre: datetime | None
    base_inicial: float
    ventas_efectivo: float
    ventas_digitales: float
    total_ventas: float
    gastos_efectivo: float
    compras_efectivo: float
    efectivo_esperado: float
    efectivo_contado: float | None
    diferencia: float | None
    observaciones: str | None


class GastoCreate(BaseModel):
    categoria: CategoriaGasto
    descripcion: str = Field(min_length=2, max_length=300)
    monto: float = Field(gt=0, allow_inf_nan=False)
    metodo_pago: MetodoGasto
    comprobante_ref: str | None = Field(default=None, max_length=120)


class GastoResponse(BaseModel):
    id: int
    consecutivo: str
    categoria: str
    descripcion: str
    monto: float
    metodo_pago: str
    comprobante_ref: str | None
    cierre_caja_id: int | None
    cierre_caja_consecutivo: str | None
    usuario_id: int
    usuario_nombre: str
    anulado: bool
    fecha_gasto: datetime
