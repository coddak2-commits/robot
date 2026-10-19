from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.user import UserRole


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole
    username: str
    full_name: Optional[str] = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: Optional[str]
    role: UserRole
    email: Optional[EmailStr]
    is_active: bool
    last_login_at: Optional[datetime]
    created_at: datetime


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8)
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: UserRole = UserRole.operator


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class PasswordResetRequest(BaseModel):
    new_password: str = Field(min_length=8)
