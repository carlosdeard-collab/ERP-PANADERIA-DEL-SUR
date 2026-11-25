from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.database.init_db import initialize_database
from app.routers import (
    auth,
    caja_gastos,
    catalogo,
    health,
    inventarios,
    mesas,
    produccion,
    reportes,
    usuarios,
    ventas,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    yield

app = FastAPI(title="ERP Panadería API", version="0.1.0", lifespan=lifespan)
configured_origins = [
    origin.strip().strip('"').strip("'").rstrip("/")
    for origin in settings.allowed_origins.split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "https://frontend-lake-omega-46.vercel.app",
        *configured_origins,
    ],
    allow_origin_regex=r"^https://[a-z0-9-]+\.vercel\.app$|^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(usuarios.router, prefix="/api")
app.include_router(catalogo.router, prefix="/api")
app.include_router(mesas.router, prefix="/api")
app.include_router(ventas.router, prefix="/api")
app.include_router(inventarios.router, prefix="/api")
app.include_router(produccion.router, prefix="/api")
app.include_router(caja_gastos.router, prefix="/api")
app.include_router(reportes.router, prefix="/api")

@app.get("/")
def root():
    return {"message": "ERP Panadería API activa", "docs": "/docs"}
