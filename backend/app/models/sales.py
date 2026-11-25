from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.connection import Base


class Mesa(Base):
    __tablename__ = "mesas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    numero: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    nombre: Mapped[str] = mapped_column(String(80), nullable=False)
    capacidad: Mapped[int] = mapped_column(Integer, default=4, nullable=False)
    estado: Mapped[str] = mapped_column(String(20), default="libre", nullable=False)
    activa: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Venta(Base):
    __tablename__ = "ventas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    consecutivo: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    tipo_atencion: Mapped[str] = mapped_column(String(20), nullable=False)
    mesa_id: Mapped[int | None] = mapped_column(ForeignKey("mesas.id"), nullable=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)
    estado: Mapped[str] = mapped_column(String(20), default="abierta", nullable=False)
    subtotal: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    descuento: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    total: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True)
    creada_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    cerrada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    mesa = relationship("Mesa")
    usuario = relationship("User")
    detalles = relationship("DetalleVenta", back_populates="venta", cascade="all, delete-orphan")
    pagos = relationship("Pago", back_populates="venta", cascade="all, delete-orphan")


class DetalleVenta(Base):
    __tablename__ = "detalle_ventas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    venta_id: Mapped[int] = mapped_column(ForeignKey("ventas.id"), nullable=False)
    producto_id: Mapped[int] = mapped_column(ForeignKey("productos.id"), nullable=False)
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)
    precio_unitario: Mapped[float] = mapped_column(Float, nullable=False)
    subtotal: Mapped[float] = mapped_column(Float, nullable=False)
    notas: Mapped[str | None] = mapped_column(String(300), nullable=True)
    stock_descontado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    venta = relationship("Venta", back_populates="detalles")
    producto = relationship("Producto")


class Pago(Base):
    __tablename__ = "pagos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    venta_id: Mapped[int] = mapped_column(ForeignKey("ventas.id"), nullable=False)
    metodo_pago: Mapped[str] = mapped_column(String(20), nullable=False)
    monto: Mapped[float] = mapped_column(Float, nullable=False)
    monto_recibido: Mapped[float] = mapped_column(Float, nullable=False)
    cambio: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    registrado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    venta = relationship("Venta", back_populates="pagos")
