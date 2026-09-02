from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.user import UserRole


def _empty_str_to_none(v):
    return v or None


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole
    username: str
    full_name: str | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: str | None
    role: UserRole
    email: EmailStr | None
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime

    # DB에 이메일 없이 생성된 계정(create_admin.py 등)은 빈 문자열('')로 저장돼 있어서
    # EmailStr 검증에 걸림 -> 목록 조회 자체가 500으로 죽었었다. None으로 정규화.
    _normalize_email = field_validator("email", mode="before")(_empty_str_to_none)


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8)
    full_name: str | None = None
    email: EmailStr | None = None
    role: UserRole = UserRole.operator

    _normalize_email = field_validator("email", mode="before")(_empty_str_to_none)


class UserUpdate(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
    role: UserRole | None = None
    is_active: bool | None = None

    _normalize_email = field_validator("email", mode="before")(_empty_str_to_none)


class PasswordResetRequest(BaseModel):
    new_password: str = Field(min_length=8)
