from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_admin, get_current_user
from app.core.database import get_db
from app.core.security import hash_password, generate_salt
from app.models.user import User
from app.schemas.user import UserOut, UserCreate, UserUpdate, PasswordResetRequest

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user)):
    return user


@router.get("/", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return db.query(User).order_by(User.created_at.desc()).all()


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    return u


@router.post("/", response_model=UserOut, status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=409, detail="Username already exists")
    salt = generate_salt()
    obj = User(
        username=body.username,
        password_hash=hash_password(body.password, salt),
        salt=salt,
        full_name=body.full_name,
        email=body.email,
        role=body.role,
        is_active=True,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body: UserUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(u, k, v)
    db.commit()
    db.refresh(u)
    return u


@router.post("/{user_id}/reset-password", response_model=UserOut)
def reset_password(
    user_id: int,
    body: PasswordResetRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    salt = generate_salt()
    u.password_hash = hash_password(body.new_password, salt)
    u.salt = salt
    db.commit()
    db.refresh(u)
    return u
