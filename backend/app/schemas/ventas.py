from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field

MetodoPago = Literal["efectivo", "nequi", "daviplata", "tarjeta", "transferencia"]


class MesaCreate(BaseModel):
    numero: int = Field(ge=1)
    nombre: str = Field(min_length=1, max_length=80)
    capacidad: int = Field(default=4, ge=1, le=50)
    activa: bool = True


class MesaUpdate(BaseModel):
    numero: int | None = Field(default=None, ge=1)
    nombre: str | None = Field(default=None, min_length=1, max_length=80)
    capacidad: int | None = Field(default=None, ge=1, le=50)
    activa: bool | None = None


class MesaResponse(BaseModel):
    id: int
    numero: int
    nombre: str
    capacidad: int
    estado: str
    activa: bool
    venta_id: int | None
    venta_total: float | None
    venta_items: int
    abierta_en: datetime | None


class VentaItemInput(BaseModel):
    producto_id: int
    cantidad: int = Field(ge=1)
    notas: str | None = Field(default=None, max_length=300)


class VentaItemResponse(BaseModel):
    id: int
    producto_id: int
    codigo: str | None
    nombre: str
    cantidad: int
    precio_unitario: float
    subtotal: float
    notas: str | None


class PagoInput(BaseModel):
    metodo_pago: MetodoPago
    monto_recibido: float | None = Field(default=None, ge=0)


class MostradorInput(BaseModel):
    items: list[VentaItemInput] = Field(min_length=1)
    pago: PagoInput
    observaciones: str | None = None


class PagoResponse(BaseModel):
    id: int
    metodo_pago: str
    monto: float
    monto_recibido: float
    cambio: float
    registrado_en: datetime


class VentaResponse(BaseModel):
    id: int
    consecutivo: str
    tipo_atencion: str
    mesa_id: int | None
    mesa_nombre: str | None
    usuario_id: int
    usuario_nombre: str
    estado: str
    subtotal: float
    descuento: float
    total: float
    observaciones: str | None
    creada_en: datetime
    cerrada_en: datetime | None
    detalles: list[VentaItemResponse]
    pagos: list[PagoResponse]
