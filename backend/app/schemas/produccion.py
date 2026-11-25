from datetime import datetime
from pydantic import BaseModel, Field, model_validator


class IngredienteRecetaInput(BaseModel):
    materia_prima_id: int = Field(gt=0)
    cantidad_requerida: float = Field(gt=0)


class RecetaInput(BaseModel):
    producto_id: int = Field(gt=0)
    nombre: str = Field(min_length=3, max_length=150)
    rendimiento_unidades: int = Field(gt=0)
    instrucciones: str | None = None
    activa: bool = True
    ingredientes: list[IngredienteRecetaInput] = Field(min_length=1)

    @model_validator(mode="after")
    def ingredientes_sin_duplicar(self):
        ids = [linea.materia_prima_id for linea in self.ingredientes]
        if len(ids) != len(set(ids)):
            raise ValueError("No se puede repetir una materia prima en la receta")
        return self


class IngredienteRecetaResponse(BaseModel):
    materia_prima_id: int
    materia_prima_nombre: str
    unidad_medida: str
    cantidad_requerida: float
    costo_unitario: float
    costo_parcial: float


class RecetaResponse(BaseModel):
    id: int
    producto_id: int
    producto_nombre: str
    precio_venta: float
    nombre: str
    rendimiento_unidades: int
    instrucciones: str | None
    activa: bool
    creado_en: datetime
    costo_lote: float
    costo_unitario_estimado: float
    margen_bruto_estimado: float
    ingredientes: list[IngredienteRecetaResponse]


class ProduccionCreate(BaseModel):
    receta_id: int = Field(gt=0)
    lotes_producidos: float = Field(gt=0)
    cantidad_buena: int = Field(gt=0)
    cantidad_merma: int = Field(default=0, ge=0)
    observaciones: str | None = Field(default=None, max_length=1000)


class DetalleProduccionResponse(BaseModel):
    materia_prima_id: int
    materia_prima_nombre: str
    unidad_medida: str
    cantidad_consumida: float
    costo_unitario: float
    costo_parcial: float


class ProduccionResponse(BaseModel):
    id: int
    consecutivo: str
    receta_id: int
    receta_nombre: str
    producto_id: int
    producto_nombre: str
    lotes_producidos: float
    cantidad_esperada: int
    cantidad_buena: int
    cantidad_merma: int
    costo_total_insumos: float
    costo_unitario_real: float
    observaciones: str | None
    usuario_id: int
    usuario_nombre: str
    fecha_produccion: datetime
    anulada: bool
    ingredientes: list[DetalleProduccionResponse]
