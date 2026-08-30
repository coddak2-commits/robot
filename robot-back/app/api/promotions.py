from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.core.database import get_db
from app.models.user import User
from app.models.welding import (
    PromotionRequest, PromotionStatus, WeldingParam,
)
from app.schemas.welding import PromotionRequestOut, PromotionReviewRequest, ALLOWED_OVERRIDE_FIELDS

router = APIRouter(prefix="/api/promotions", tags=["promotions"])


@router.get("/", response_model=list[PromotionRequestOut])
def list_promotions(
    status: PromotionStatus | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(PromotionRequest)
    if status:
        q = q.filter(PromotionRequest.status == status)
    return q.order_by(PromotionRequest.created_at.desc()).limit(200).all()


@router.get("/{req_id}", response_model=PromotionRequestOut)
def get_promotion(req_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    r = db.query(PromotionRequest).filter(PromotionRequest.id == req_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    return r


@router.post("/{req_id}/review", response_model=PromotionRequestOut)
def review_promotion(
    req_id: int,
    body: PromotionReviewRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    r = db.query(PromotionRequest).filter(PromotionRequest.id == req_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    if r.status != PromotionStatus.pending:
        raise HTTPException(status_code=409, detail=f"Already {r.status.value}")

    if body.action == "approve":
        # welding_params UPDATE
        target = db.query(WeldingParam).filter(
            WeldingParam.active.is_(True),
            WeldingParam.posture == r.posture,
            WeldingParam.gap_mm == r.gap_mm,
            WeldingParam.material == r.material,
            WeldingParam.thickness_mm == r.thickness_mm,
            WeldingParam.joint_type == r.joint_type,
        ).first()
        if not target:
            raise HTTPException(status_code=404, detail="Target param not found (may have been deactivated)")
        # 필드 이름 검증 - 화이트리스트에 없는 필드(id, active 등)는 setattr 대상이 될 수 없음
        if r.field_name not in ALLOWED_OVERRIDE_FIELDS or not hasattr(target, r.field_name):
            raise HTTPException(status_code=400, detail=f"Invalid field {r.field_name}")
        # 값 세팅
        setattr(target, r.field_name, r.requested_value)
        r.status = PromotionStatus.approved
    elif body.action == "reject":
        r.status = PromotionStatus.rejected
    else:
        raise HTTPException(status_code=400, detail="Invalid action")

    r.reviewed_by = user.id
    r.reviewer_note = body.note
    r.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(r)
    return r
