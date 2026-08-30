import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt

from app.core.config import settings


def generate_salt() -> str:
    return secrets.token_hex(16)


def hash_password(password: str, salt: str = "") -> str:
    # robot-core(C++)와 동일한 방식: SHA256(salt + password). salt=""면 기존 무salt 계정과 동일한 값.
    return hashlib.sha256((salt + password).encode("utf-8")).hexdigest()


def verify_password(plain: str, hashed: str, salt: Optional[str] = None) -> bool:
    expected = hash_password(plain, salt or "")
    return hmac.compare_digest(expected, (hashed or "").lower())


def create_access_token(sub: str, role: str, extra: Optional[dict] = None) -> str:
    payload = {
        "sub": sub,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES),
        "iat": datetime.now(timezone.utc),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as e:
        raise ValueError(f"Invalid token: {e}") from e
