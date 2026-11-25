from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.connection import Base


class CierreCaja(Base):
    __tablename__ = "cierres_caja"
    __table_args__ = (
        Index(
            "uq_cierres_caja_abierta",
            "estado",
            unique=True,
            sqlite_where=text("estado = 'abierta'"),
            postgresql_where=text("estado = 'abierta'"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    consecutivo: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    usuario_apertura_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)
    usuario_cierre_id: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id"), nullable=True
    )
    estado: Mapped[str] = mapped_column(String(20), default="abierta", nullable=False)
    fecha_apertura: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    fecha_cierre: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    base_inicial: Mapped[float] = mapped_column(Float, nullable=False)
    ventas_efectivo: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    ventas_digitales: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    total_ventas: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    gastos_efectivo: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    compras_efectivo: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    efectivo_esperado: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    efectivo_contado: Mapped[float | None] = mapped_column(Float, nullable=True)
    diferencia: Mapped[float | None] = mapped_column(Float, nullable=True)
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True)

    usuario_apertura = relationship("User", foreign_keys=[usuario_apertura_id])
    usuario_cierre = relationship("User", foreign_keys=[usuario_cierre_id])
    gastos = relationship("Gasto", back_populates="cierre_caja")


class Gasto(Base):
    __tablename__ = "gastos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    consecutivo: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    categoria: Mapped[str] = mapped_column(String(30), nullable=False)
    descripcion: Mapped[str] = mapped_column(String(300), nullable=False)
    monto: Mapped[float] = mapped_column(Float, nullable=False)
    metodo_pago: Mapped[str] = mapped_column(String(30), nullable=False)
    comprobante_ref: Mapped[str | None] = mapped_column(String(120), nullable=True)
    cierre_caja_id: Mapped[int | None] = mapped_column(
        ForeignKey("cierres_caja.id"), nullable=True
    )
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)
    anulado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    fecha_gasto: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    cierre_caja = relationship("CierreCaja", back_populates="gastos")
    usuario = relationship("User")
