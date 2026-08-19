from datetime import datetime
from sqlalchemy import String, Boolean, Enum, TIMESTAMP, Integer
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
import enum

from app.core.database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    operator = "operator"
    viewer = "viewer"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column("name", String(100))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False, default=UserRole.operator)
    email: Mapped[str | None] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column("active", Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column("last_login", TIMESTAMP)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP, server_default=func.now(), onupdate=func.now()
    )
