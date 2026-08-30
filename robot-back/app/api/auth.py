from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import verify_password, create_access_token, generate_salt, hash_password
from app.models.user import User
from app.schemas.user import TokenResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.username == form.username).first()
    if not user or not verify_password(form.password, user.password_hash, user.salt):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account disabled",
        )
    if not user.salt:
        # 레거시(무salt) 계정 - 로그인 성공 = 평문 비밀번호를 아는 유일한 순간이므로 지금 마이그레이션
        new_salt = generate_salt()
        user.password_hash = hash_password(form.password, new_salt)
        user.salt = new_salt
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    token = create_access_token(sub=user.username, role=user.role.value)
    return TokenResponse(
        access_token=token,
        role=user.role,
        username=user.username,
        full_name=user.full_name,
    )
