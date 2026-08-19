"""관리자 수동 실행 (배치 즉시 실행 등)"""
from fastapi import APIRouter, Depends

from app.api.deps import require_admin
from app.models.user import User
from app.utils.scheduler import trigger_promotion_detection_now

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/run-promotion-detection")
def run_promotion_detection_now(_: User = Depends(require_admin)):
    """승격 자동 감지 배치를 즉시 실행 (테스트/디버깅용)"""
    trigger_promotion_detection_now()
    return {"status": "triggered"}
