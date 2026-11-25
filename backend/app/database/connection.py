from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from app.core.config import settings

class Base(DeclarativeBase):
    pass

url = settings.database_url.strip()
if url.startswith("postgres://"):
    url = f"postgresql://{url.removeprefix('postgres://')}"
if url.startswith("sqlite:///"):
    relative = url.replace("sqlite:///", "", 1)
    backend_root = Path(__file__).resolve().parents[2]
    db_path = (backend_root / relative).resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    url = f"sqlite:///{db_path.as_posix()}"

is_sqlite = url.startswith("sqlite")
engine = create_engine(
    url,
    connect_args={"check_same_thread": False} if is_sqlite else {},
    pool_pre_ping=not is_sqlite,
    pool_recycle=280 if not is_sqlite else -1,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
