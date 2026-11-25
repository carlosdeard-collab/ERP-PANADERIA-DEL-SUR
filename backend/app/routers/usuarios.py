from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.models.user import Auditoria, Role, User
from app.core.security import hash_password, require_admin
from app.schemas.usuarios import UsuarioCreate, UsuarioResponse, UsuarioUpdate

router = APIRouter(prefix="/usuarios", tags=["Usuarios"])

def serialize_user(user: User) -> UsuarioResponse:
    return UsuarioResponse(
        id=user.id,
        nombre=user.full_name,
        username=user.username,
        rol=user.role.name,
        activo=user.active,
        creado_en=user.created_at.isoformat(),
    )

@router.get("", response_model=list[UsuarioResponse])
def list_users(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    return [serialize_user(user) for user in db.query(User).order_by(User.id).all()]

@router.post("", response_model=UsuarioResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    data: UsuarioCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if db.query(User).filter_by(username=data.username).first():
        raise HTTPException(status_code=409, detail="El usuario ya existe")
    role = db.query(Role).filter_by(name=data.rol).first()
    if not role:
        raise HTTPException(status_code=400, detail="Rol inválido")
    user = User(
        username=data.username,
        full_name=data.nombre,
        password_hash=hash_password(data.password),
        role_id=role.id,
        active=True,
    )
    db.add(user)
    db.flush()
    db.add(Auditoria(
        event_type="usuario_creado",
        actor_id=admin.id,
        target_user_id=user.id,
        details=f"Creado usuario {user.username}",
    ))
    db.commit()
    db.refresh(user)
    return serialize_user(user)

@router.put("/{usuario_id}", response_model=UsuarioResponse)
def update_user(
    usuario_id: int,
    data: UsuarioUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == usuario_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.username == "admin" and admin.id == user.id and data.activo is False:
        raise HTTPException(status_code=400, detail="No puedes desactivar tu propia cuenta administradora")

    changes = []
    if data.nombre is not None:
        user.full_name = data.nombre
        changes.append("nombre")
    if data.rol is not None:
        role = db.query(Role).filter_by(name=data.rol).first()
        if role:
            user.role_id = role.id
            changes.append("rol")
    if data.activo is not None:
        user.active = data.activo
        changes.append("activo")
    if data.password is not None:
        user.password_hash = hash_password(data.password)
        changes.append("password")

    db.flush()
    db.add(Auditoria(
        event_type="usuario_modificado",
        actor_id=admin.id,
        target_user_id=user.id,
        details="Campos modificados: " + ", ".join(changes),
    ))
    db.commit()
    db.refresh(user)
    return serialize_user(user)
