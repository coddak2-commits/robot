"""전역 설정 API: welding_defaults, alarm_thresholds, override_limits, promotion_detection_config"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.core.database import get_db
from app.models.user import User
from app.models.welding import (
    WeldingDefault, AlarmThreshold, OverrideLimit, PromotionDetectionConfig,
)
from app.schemas.welding import (
    WeldingDefaultOut, WeldingDefaultUpdate,
    AlarmThresholdOut, AlarmThresholdUpdate,
    OverrideLimitOut, OverrideLimitUpdate,
    PromotionDetectionConfigOut, PromotionDetectionConfigUpdate,
)

router = APIRouter(prefix="/api/settings", tags=["settings"])


# =====================================================================
# 전역 기본값 (가스/시간)
# =====================================================================
@router.get("/defaults", response_model=WeldingDefaultOut)
def get_defaults(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    obj = db.query(WeldingDefault).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Defaults not initialized")
    return obj


@router.patch("/defaults", response_model=WeldingDefaultOut)
def update_defaults(
    body: WeldingDefaultUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    obj = db.query(WeldingDefault).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Defaults not initialized")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


# =====================================================================
# 편차 알람 임계값
# =====================================================================
@router.get("/alarm-thresholds", response_model=list[AlarmThresholdOut])
def list_alarm_thresholds(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(AlarmThreshold).all()


@router.patch("/alarm-thresholds/{field_name}", response_model=AlarmThresholdOut)
def update_alarm_threshold(
    field_name: str,
    body: AlarmThresholdUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    obj = db.query(AlarmThreshold).filter(AlarmThreshold.field_name == field_name).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


# =====================================================================
# 오버라이드 허용 범위
# =====================================================================
@router.get("/override-limits", response_model=list[OverrideLimitOut])
def list_override_limits(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(OverrideLimit).all()


@router.patch("/override-limits/{field_name}", response_model=OverrideLimitOut)
def update_override_limit(
    field_name: str,
    body: OverrideLimitUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    obj = db.query(OverrideLimit).filter(OverrideLimit.field_name == field_name).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


# =====================================================================
# 자동 감지 설정
# =====================================================================
@router.get("/detection-config", response_model=PromotionDetectionConfigOut)
def get_detection_config(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    obj = db.query(PromotionDetectionConfig).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Config not initialized")
    return obj


@router.patch("/detection-config", response_model=PromotionDetectionConfigOut)
def update_detection_config(
    body: PromotionDetectionConfigUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    obj = db.query(PromotionDetectionConfig).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Config not initialized")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj
