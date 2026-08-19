from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_operator
from app.core.database import get_db
from app.models.user import User
from app.models.welding import ParamOverride, OverrideLimit, Posture
from app.schemas.welding import ParamOverrideCreate, ParamOverrideOut

router = APIRouter(prefix="/api/overrides", tags=["overrides"])


def _get_limit(db: Session, field: str) -> OverrideLimit | None:
    return db.query(OverrideLimit).filter(OverrideLimit.field_name == field).first()


def _validate_override_range(db: Session, field: str, original: Decimal, override: Decimal) -> str | None:
    """오버라이드 값이 허용 범위 내인지 검사. 벗어나면 에러 메시지 반환"""
    lim = _get_limit(db, field)
    if not lim:
        return None
    if original == 0:
        return None
    diff_pct = ((override - original) / original) * 100
    if diff_pct > 0 and lim.max_up_pct is not None and diff_pct > lim.max_up_pct:
        return f"{field}: 상승 {diff_pct:.1f}% > 허용 {lim.max_up_pct}%"
    if diff_pct < 0 and lim.max_down_pct is not None and abs(diff_pct) > lim.max_down_pct:
        return f"{field}: 하강 {abs(diff_pct):.1f}% > 허용 {lim.max_down_pct}%"
    return None


@router.post("/", response_model=ParamOverrideOut, status_code=201)
def create_override(
    body: ParamOverrideCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_operator),
):
    err = _validate_override_range(db, body.field_name, body.original_value, body.override_value)
    if err:
        raise HTTPException(status_code=400, detail=f"Override out of allowed range: {err}")
    obj = ParamOverride(**body.model_dump(), user_id=user.id)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/", response_model=list[ParamOverrideOut])
def list_overrides(
    job_id: int | None = None,
    posture: Posture | None = None,
    gap_mm: Decimal | None = None,
    limit: int = Query(100, le=1000),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(ParamOverride)
    if job_id:
        q = q.filter(ParamOverride.job_id == job_id)
    if posture:
        q = q.filter(ParamOverride.posture == posture)
    if gap_mm is not None:
        q = q.filter(ParamOverride.gap_mm == gap_mm)
    return q.order_by(ParamOverride.created_at.desc()).limit(limit).all()
