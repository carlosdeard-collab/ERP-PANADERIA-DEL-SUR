from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.connection import Base


class Categoria(Base):
    __tablename__ = "categorias"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    descripcion: Mapped[str | None] = mapped_column(String(300), nullable=True)
    activa: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    productos = relationship("Producto", back_populates="categoria")


class Producto(Base):
    __tablename__ = "productos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    codigo: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    descripcion: Mapped[str | None] = mapped_column(String(500), nullable=True)
    categoria_id: Mapped[int] = mapped_column(ForeignKey("categorias.id"), nullable=False)
    precio_venta: Mapped[float] = mapped_column(Float, nullable=False)
    costo_estimado: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    stock_actual: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    controlar_stock: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    disponible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    categoria = relationship("Categoria", back_populates="productos")
