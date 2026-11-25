from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.connection import Base


class Receta(Base):
    __tablename__ = "recetas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    producto_id: Mapped[int] = mapped_column(ForeignKey("productos.id"), unique=True, nullable=False)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    rendimiento_unidades: Mapped[int] = mapped_column(Integer, nullable=False)
    instrucciones: Mapped[str | None] = mapped_column(Text, nullable=True)
    activa: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    producto = relationship("Producto")
    detalles = relationship(
        "DetalleReceta", back_populates="receta", cascade="all, delete-orphan"
    )
    producciones = relationship("Produccion", back_populates="receta")


class DetalleReceta(Base):
    __tablename__ = "detalles_receta"
    __table_args__ = (
        UniqueConstraint("receta_id", "materia_prima_id", name="uq_receta_materia_prima"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    receta_id: Mapped[int] = mapped_column(ForeignKey("recetas.id"), nullable=False)
    materia_prima_id: Mapped[int] = mapped_column(
        ForeignKey("materias_primas.id"), nullable=False
    )
    cantidad_requerida: Mapped[float] = mapped_column(Float, nullable=False)

    receta = relationship("Receta", back_populates="detalles")
    materia_prima = relationship("MateriaPrima")


class Produccion(Base):
    __tablename__ = "producciones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    consecutivo: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    receta_id: Mapped[int] = mapped_column(ForeignKey("recetas.id"), nullable=False)
    producto_id: Mapped[int] = mapped_column(ForeignKey("productos.id"), nullable=False)
    lotes_producidos: Mapped[float] = mapped_column(Float, nullable=False)
    cantidad_esperada: Mapped[int] = mapped_column(Integer, nullable=False)
    cantidad_buena: Mapped[int] = mapped_column(Integer, nullable=False)
    cantidad_merma: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    costo_total_insumos: Mapped[float] = mapped_column(Float, nullable=False)
    costo_unitario_real: Mapped[float] = mapped_column(Float, nullable=False)
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)
    fecha_produccion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    anulada: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    receta = relationship("Receta", back_populates="producciones")
    producto = relationship("Producto")
    usuario = relationship("User")
    detalles = relationship(
        "DetalleProduccion", back_populates="produccion", cascade="all, delete-orphan"
    )


class DetalleProduccion(Base):
    __tablename__ = "detalles_produccion"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    produccion_id: Mapped[int] = mapped_column(ForeignKey("producciones.id"), nullable=False)
    materia_prima_id: Mapped[int] = mapped_column(
        ForeignKey("materias_primas.id"), nullable=False
    )
    cantidad_consumida: Mapped[float] = mapped_column(Float, nullable=False)
    costo_unitario: Mapped[float] = mapped_column(Float, nullable=False)

    produccion = relationship("Produccion", back_populates="detalles")
    materia_prima = relationship("MateriaPrima")
