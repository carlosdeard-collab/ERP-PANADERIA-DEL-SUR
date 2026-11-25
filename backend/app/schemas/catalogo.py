from pydantic import BaseModel, Field


class CategoriaCreate(BaseModel):
    nombre: str = Field(min_length=2, max_length=100)
    descripcion: str | None = Field(default=None, max_length=300)


class CategoriaUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=100)
    descripcion: str | None = Field(default=None, max_length=300)
    activa: bool | None = None


class CategoriaResponse(BaseModel):
    id: int
    nombre: str
    descripcion: str | None
    activa: bool


class ProductoCreate(BaseModel):
    codigo: str | None = Field(default=None, max_length=50)
    nombre: str = Field(min_length=2, max_length=150)
    descripcion: str | None = Field(default=None, max_length=500)
    categoria_id: int
    precio_venta: float = Field(ge=0)
    costo_estimado: float = Field(default=0, ge=0)
    stock_actual: int = Field(default=0, ge=0)
    controlar_stock: bool = True
    disponible: bool = True


class ProductoUpdate(BaseModel):
    codigo: str | None = Field(default=None, max_length=50)
    nombre: str | None = Field(default=None, min_length=2, max_length=150)
    descripcion: str | None = Field(default=None, max_length=500)
    categoria_id: int | None = None
    precio_venta: float | None = Field(default=None, ge=0)
    costo_estimado: float | None = Field(default=None, ge=0)
    stock_actual: int | None = Field(default=None, ge=0)
    controlar_stock: bool | None = None
    disponible: bool | None = None


class ProductoResponse(BaseModel):
    id: int
    codigo: str | None
    nombre: str
    descripcion: str | None
    categoria_id: int
    categoria_nombre: str
    precio_venta: float
    costo_estimado: float
    stock_actual: int
    controlar_stock: bool
    disponible: bool
    creado_en: str
