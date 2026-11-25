from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.connection import Base


class MateriaPrima(Base):
    __tablename__ = "materias_primas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    codigo: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    unidad_medida: Mapped[str] = mapped_column(String(20), nullable=False)
    stock_actual: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    stock_minimo: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    costo_promedio: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class Proveedor(Base):
    __tablename__ = "proveedores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    nit_documento: Mapped[str | None] = mapped_column(String(40), nullable=True)
    telefono: Mapped[str | None] = mapped_column(String(40), nullable=True)
    contacto: Mapped[str | None] = mapped_column(String(120), nullable=True)
    direccion: Mapped[str | None] = mapped_column(String(250), nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class Compra(Base):
    __tablename__ = "compras"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    consecutivo: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    proveedor_id: Mapped[int] = mapped_column(ForeignKey("proveedores.id"), nullable=False)
    numero_factura: Mapped[str | None] = mapped_column(String(80), nullable=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)
    metodo_pago: Mapped[str] = mapped_column(String(20), nullable=False)
    total: Mapped[float] = mapped_column(Float, nullable=False)
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True)
    fecha_compra: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    proveedor = relationship("Proveedor")
    usuario = relationship("User")
    detalles = relationship("DetalleCompra", back_populates="compra", cascade="all, delete-orphan")


class DetalleCompra(Base):
    __tablename__ = "detalles_compra"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    compra_id: Mapped[int] = mapped_column(ForeignKey("compras.id"), nullable=False)
    materia_prima_id: Mapped[int] = mapped_column(ForeignKey("materias_primas.id"), nullable=False)
    cantidad: Mapped[float] = mapped_column(Float, nullable=False)
    costo_unitario: Mapped[float] = mapped_column(Float, nullable=False)
    subtotal: Mapped[float] = mapped_column(Float, nullable=False)

    compra = relationship("Compra", back_populates="detalles")
    materia_prima = relationship("MateriaPrima")


class MovimientoInventario(Base):
    __tablename__ = "movimientos_inventario"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tipo_item: Mapped[str] = mapped_column(String(30), nullable=False)
    materia_prima_id: Mapped[int | None] = mapped_column(
        ForeignKey("materias_primas.id"), nullable=True
    )
    producto_id: Mapped[int | None] = mapped_column(ForeignKey("productos.id"), nullable=True)
    tipo_movimiento: Mapped[str] = mapped_column(String(30), nullable=False)
    cantidad: Mapped[float] = mapped_column(Float, nullable=False)
    stock_anterior: Mapped[float] = mapped_column(Float, nullable=False)
    stock_nuevo: Mapped[float] = mapped_column(Float, nullable=False)
    costo_unitario: Mapped[float | None] = mapped_column(Float, nullable=True)
    referencia: Mapped[str] = mapped_column(String(250), nullable=False)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    materia_prima = relationship("MateriaPrima")
    producto = relationship("Producto")
    usuario = relationship("User")
