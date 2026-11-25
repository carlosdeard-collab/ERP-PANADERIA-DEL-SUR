from pydantic import BaseModel, Field
from typing import Literal

class UsuarioResponse(BaseModel):
    id: int
    nombre: str
    username: str
    rol: str
    activo: bool
    creado_en: str

class UsuarioCreate(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=128)
    rol: Literal["administradora", "mesera"]

class UsuarioUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=120)
    rol: Literal["administradora", "mesera"] | None = None
    activo: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)
