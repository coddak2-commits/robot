from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_operator
from app.core.database import get_db
from app.models.user import User
from app.models.welding import WeldingJob, WeldPointGap, JobStatus
from app.schemas.welding import (
    WeldingJobCreate, WeldingJobUpdate, WeldingJobOut,
    WeldPointGapCreate, WeldPointGapBulkCreate, WeldPointGapOut,
)

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/", response_model=list[WeldingJobOut])
def list_jobs(
    status: JobStatus | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(WeldingJob)
    if status:
        q = q.filter(WeldingJob.status == status)
    return q.order_by(WeldingJob.created_at.desc()).limit(200).all()


@router.get("/{job_id}", response_model=WeldingJobOut)
def get_job(job_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    j = db.query(WeldingJob).filter(WeldingJob.id == job_id).first()
    if not j:
        raise HTTPException(status_code=404, detail="Not found")
    return j


@router.post("/", response_model=WeldingJobOut, status_code=201)
def create_job(
    body: WeldingJobCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_operator),
):
    obj = WeldingJob(**body.model_dump(), started_by=user.id)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.patch("/{job_id}", response_model=WeldingJobOut)
def update_job(
    job_id: int,
    body: WeldingJobUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_operator),
):
    j = db.query(WeldingJob).filter(WeldingJob.id == job_id).first()
    if not j:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(j, k, v)
    db.commit()
    db.refresh(j)
    return j


@router.post("/{job_id}/start", response_model=WeldingJobOut)
def start_job(job_id: int, db: Session = Depends(get_db), user: User = Depends(require_operator)):
    j = db.query(WeldingJob).filter(WeldingJob.id == job_id).first()
    if not j:
        raise HTTPException(status_code=404, detail="Not found")
    if j.status not in (JobStatus.created, JobStatus.ready, JobStatus.paused):
        raise HTTPException(status_code=400, detail=f"Cannot start from {j.status}")
    j.status = JobStatus.running
    j.started_by = user.id
    j.started_at = j.started_at or datetime.now(timezone.utc)
    db.commit()
    db.refresh(j)
    return j


@router.post("/{job_id}/complete", response_model=WeldingJobOut)
def complete_job(job_id: int, db: Session = Depends(get_db), _: User = Depends(require_operator)):
    j = db.query(WeldingJob).filter(WeldingJob.id == job_id).first()
    if not j:
        raise HTTPException(status_code=404, detail="Not found")
    j.status = JobStatus.completed
    j.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(j)
    return j


# =====================================================================
# 포인트별 갭
# =====================================================================
@router.get("/{job_id}/point-gaps", response_model=list[WeldPointGapOut])
def list_point_gaps(job_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(WeldPointGap).filter(WeldPointGap.job_id == job_id).order_by(WeldPointGap.point_code).all()


@router.post("/{job_id}/point-gaps", response_model=list[WeldPointGapOut], status_code=201)
def bulk_upsert_point_gaps(
    job_id: int,
    body: WeldPointGapBulkCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_operator),
):
    if body.job_id != job_id:
        raise HTTPException(status_code=400, detail="job_id mismatch")
    # 기존 삭제 후 새로 삽입 (동일 point_code 중복 방지 UNIQUE 제약이 있으므로)
    db.query(WeldPointGap).filter(WeldPointGap.job_id == job_id).delete()
    objs = [
        WeldPointGap(
            job_id=job_id,
            point_code=p.point_code,
            gap_mm=p.gap_mm,
            posture=p.posture,
            thickness_mm=p.thickness_mm,
        )
        for p in body.points
    ]
    db.add_all(objs)
    db.commit()
    return db.query(WeldPointGap).filter(WeldPointGap.job_id == job_id).order_by(WeldPointGap.point_code).all()
