from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field

UnidadMedida = Literal["kg", "g", "l", "ml", "unidad"]
MetodoCompra = Literal["efectivo", "transferencia", "nequi", "daviplata", "credito"]
TipoAjuste = Literal["ajuste_positivo", "ajuste_negativo", "merma"]


class MateriaPrimaCreate(BaseModel):
    codigo: str | None = Field(default=None, max_length=50)
    nombre: str = Field(min_length=2, max_length=150)
    unidad_medida: UnidadMedida
    stock_actual: float = Field(default=0, ge=0)
    stock_minimo: float = Field(default=0, ge=0)
    costo_promedio: float = Field(default=0, ge=0)
    activo: bool = True


class MateriaPrimaUpdate(BaseModel):
    codigo: str | None = Field(default=None, max_length=50)
    nombre: str | None = Field(default=None, min_length=2, max_length=150)
    unidad_medida: UnidadMedida | None = None
    stock_minimo: float | None = Field(default=None, ge=0)
    costo_promedio: float | None = Field(default=None, ge=0)
    activo: bool | None = None


class MateriaPrimaResponse(BaseModel):
    id: int
    codigo: str | None
    nombre: str
    unidad_medida: str
    stock_actual: float
    stock_minimo: float
    costo_promedio: float
    activo: bool
    creado_en: datetime


class AjusteInventario(BaseModel):
    tipo_movimiento: TipoAjuste
    cantidad: float = Field(gt=0)
    motivo: str = Field(min_length=3, max_length=250)


class ProveedorInput(BaseModel):
    nombre: str = Field(min_length=2, max_length=150)
    nit_documento: str | None = Field(default=None, max_length=40)
    telefono: str | None = Field(default=None, max_length=40)
    contacto: str | None = Field(default=None, max_length=120)
    direccion: str | None = Field(default=None, max_length=250)
    activo: bool = True


class ProveedorResponse(BaseModel):
    id: int
    nombre: str
    nit_documento: str | None
    telefono: str | None
    contacto: str | None
    direccion: str | None
    activo: bool
    creado_en: datetime


class DetalleCompraInput(BaseModel):
    materia_prima_id: int
    cantidad: float = Field(gt=0)
    costo_unitario: float = Field(ge=0)


class CompraCreate(BaseModel):
    proveedor_id: int
    numero_factura: str | None = Field(default=None, max_length=80)
    metodo_pago: MetodoCompra
    observaciones: str | None = None
    detalles: list[DetalleCompraInput] = Field(min_length=1)


class DetalleCompraResponse(BaseModel):
    id: int
    materia_prima_id: int
    materia_prima_nombre: str
    unidad_medida: str
    cantidad: float
    costo_unitario: float
    subtotal: float


class CompraResponse(BaseModel):
    id: int
    consecutivo: str
    proveedor_id: int
    proveedor_nombre: str
    numero_factura: str | None
    usuario_id: int
    usuario_nombre: str
    metodo_pago: str
    total: float
    observaciones: str | None
    fecha_compra: datetime
    detalles: list[DetalleCompraResponse]


class MovimientoResponse(BaseModel):
    id: int
    tipo_item: str
    materia_prima_id: int | None
    producto_id: int | None
    item_nombre: str
    tipo_movimiento: str
    cantidad: float
    stock_anterior: float
    stock_nuevo: float
    costo_unitario: float | None
    referencia: str
    usuario_id: int
    usuario_nombre: str
    fecha: datetime
