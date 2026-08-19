from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_operator
from app.core.database import get_db
from app.models.user import User
from app.models.welding import DeviationEvent
from app.schemas.welding import DeviationEventCreate, DeviationEventOut

router = APIRouter(prefix="/api/deviations", tags=["deviations"])


@router.post("/", response_model=DeviationEventOut, status_code=201)
def create_deviation(
    body: DeviationEventCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_operator),
):
    """C++ Robot Core가 편차 감지 시 호출"""
    obj = DeviationEvent(**body.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/", response_model=list[DeviationEventOut])
def list_deviations(
    job_id: int | None = None,
    level: int | None = None,
    limit: int = Query(200, le=2000),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(DeviationEvent)
    if job_id:
        q = q.filter(DeviationEvent.job_id == job_id)
    if level:
        q = q.filter(DeviationEvent.level == level)
    return q.order_by(DeviationEvent.created_at.desc()).limit(limit).all()
