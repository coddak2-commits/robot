from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin, require_operator
from app.core.database import get_db
from app.models.user import User
from app.models.welding import WeldingParam, Posture
from app.schemas.welding import (
    WeldingParamCreate, WeldingParamUpdate, WeldingParamOut,
    WeldingParamDeactivate, ParamLookupResult,
)
from app.utils.interpolation import (
    clamp_gap, lookup_exact, find_nearest_thickness, find_similar_candidates,
    lookup_with_interpolation,
)

router = APIRouter(prefix="/api/params", tags=["params"])


@router.get("/lookup", response_model=ParamLookupResult)
def lookup_params(
    posture: Posture,
    gap: Decimal = Query(ge=0),
    material: str = "SS400",
    thickness: Decimal = Query(...),
    joint: str = "fillet",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """갭 기반 파라미터 조회 (계층적 폴백)"""
    gap_clamped, warning = clamp_gap(gap)

    # 1. 정확 매치 + 인접 갭 보간
    result = lookup_with_interpolation(db, posture, gap_clamped, material, thickness, joint)
    if result and result.get("matched"):
        return ParamLookupResult(matched=True, fallback_level=1, warning=warning, param=result["param"])

    # 정확 없어도 같은 두께에 인접 갭 있으면 보간
    if result and result.get("interpolated"):
        # 임시 응답용 최근접값 반환 (실제 시스템에서는 보간값 별도 스키마로 확장 가능)
        return ParamLookupResult(
            matched=False, fallback_level=1,
            warning=(warning or "") + " 갭 인접값 선형 보간 사용",
            param=result.get("base_lower") or result.get("base_upper"),
        )

    # 2. 두께 근접 폴백
    nearest = find_nearest_thickness(db, posture, gap_clamped, material, thickness, joint)
    if nearest:
        return ParamLookupResult(
            matched=False, fallback_level=2,
            warning=f"두께 {thickness}mm 등록 없음, {nearest.thickness_mm}mm 데이터 사용",
            param=nearest,
        )

    # 3. 유사 조합 목록 → 사용자 선택
    candidates = find_similar_candidates(db, posture, gap_clamped, material, joint)
    if candidates:
        return ParamLookupResult(
            matched=False, fallback_level=3,
            warning="정확 매치 없음. 유사 조합 중 선택 필요",
            candidates=candidates,
        )

    # 4. 완전 미등록
    return ParamLookupResult(
        matched=False, fallback_level=0,
        warning="등록된 파라미터 없음. 관리자에게 등록 요청 필요",
    )


@router.get("/", response_model=list[WeldingParamOut])
def list_params(
    posture: Optional[Posture] = None,
    material: Optional[str] = None,
    thickness: Optional[Decimal] = None,
    joint: Optional[str] = None,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """파라미터 목록 조회"""
    q = db.query(WeldingParam)
    if not include_inactive:
        q = q.filter(WeldingParam.active.is_(True))
    if posture:
        q = q.filter(WeldingParam.posture == posture)
    if material:
        q = q.filter(WeldingParam.material == material)
    if thickness is not None:
        q = q.filter(WeldingParam.thickness_mm == thickness)
    if joint:
        q = q.filter(WeldingParam.joint_type == joint)
    return q.order_by(WeldingParam.posture, WeldingParam.thickness_mm, WeldingParam.gap_mm).all()


@router.get("/{param_id}", response_model=WeldingParamOut)
def get_param(param_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    param = db.query(WeldingParam).filter(WeldingParam.id == param_id).first()
    if not param:
        raise HTTPException(status_code=404, detail="Not found")
    return param


@router.post("/", response_model=WeldingParamOut, status_code=201)
def create_param(
    body: WeldingParamCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    exists = lookup_exact(db, body.posture, body.gap_mm, body.material, body.thickness_mm, body.joint_type)
    if exists:
        raise HTTPException(status_code=409, detail="Same active combination already exists. Edit instead.")
    obj = WeldingParam(**body.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.patch("/{param_id}", response_model=WeldingParamOut)
def update_param(
    param_id: int,
    body: WeldingParamUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    obj = db.query(WeldingParam).filter(WeldingParam.id == param_id, WeldingParam.active.is_(True)).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Not found or already deactivated")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{param_id}", response_model=WeldingParamOut)
def deactivate_param(
    param_id: int,
    body: WeldingParamDeactivate,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """소프트 삭제 (사유 필수)"""
    obj = db.query(WeldingParam).filter(WeldingParam.id == param_id, WeldingParam.active.is_(True)).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Not found or already deactivated")
    obj.active = False
    obj.deactivated_at = datetime.now(timezone.utc)
    obj.deactivated_by = user.id
    obj.deactivation_reason = body.reason
    db.commit()
    db.refresh(obj)
    return obj


@router.post("/{param_id}/restore", response_model=WeldingParamOut)
def restore_param(
    param_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    obj = db.query(WeldingParam).filter(WeldingParam.id == param_id, WeldingParam.active.is_(False)).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Not found or already active")
    dup = lookup_exact(db, obj.posture, obj.gap_mm, obj.material, obj.thickness_mm, obj.joint_type)
    if dup:
        raise HTTPException(status_code=409, detail="Active combination already exists")
    obj.active = True
    obj.deactivated_at = None
    obj.deactivated_by = None
    obj.deactivation_reason = None
    db.commit()
    db.refresh(obj)
    return obj
