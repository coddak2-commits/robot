from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import func, and_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.models.welding import WeldingJob, JobStatus, DeviationEvent

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
def dashboard_stats(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    today_jobs = (
        db.query(func.count(WeldingJob.id))
        .filter(WeldingJob.created_at >= today_start)
        .scalar() or 0
    )
    completed_today = (
        db.query(func.count(WeldingJob.id))
        .filter(and_(WeldingJob.completed_at >= today_start, WeldingJob.status == JobStatus.completed))
        .scalar() or 0
    )
    failed_today = (
        db.query(func.count(WeldingJob.id))
        .filter(and_(WeldingJob.updated_at >= today_start, WeldingJob.status.in_([JobStatus.failed, JobStatus.aborted])))
        .scalar() or 0
    )
    total_weld_count = (
        db.query(func.count(WeldingJob.id))
        .filter(WeldingJob.status == JobStatus.completed)
        .scalar() or 0
    )

    running = (
        db.query(WeldingJob)
        .filter(WeldingJob.status == JobStatus.running)
        .order_by(WeldingJob.started_at.desc())
        .first()
    )
    current_job = None
    if running:
        current_job = {
            "id": running.id,
            "job_name": running.job_name,
            "cell_type": running.cell_type,
            "started_at": running.started_at.isoformat() if running.started_at else None,
        }

    denom = completed_today + failed_today
    defect_rate = (failed_today / denom * 100) if denom > 0 else 0.0

    recent_deviations_24h = (
        db.query(func.count(DeviationEvent.id))
        .filter(DeviationEvent.created_at >= now - timedelta(hours=24))
        .scalar() or 0
    )

    return {
        "todayJobs": today_jobs,
        "completedJobs": completed_today,
        "failedJobs": failed_today,
        "totalWeldCount": total_weld_count,
        "defectRate": round(defect_rate, 1),
        "currentJob": current_job,
        "recentDeviations24h": recent_deviations_24h,
    }
