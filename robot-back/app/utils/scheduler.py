"""APScheduler 기반 배치 스케줄러"""
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.database import SessionLocal
from app.utils.promotion_detector import detect_promotion_candidates

_scheduler: BackgroundScheduler | None = None


def _run_promotion_detection():
    db = SessionLocal()
    try:
        created = detect_promotion_candidates(db)
        print(f"[SCHEDULER] promotion_detector: {len(created)} candidates created")
    except Exception as e:
        print(f"[SCHEDULER] promotion_detector error: {e}")
    finally:
        db.close()


def start_scheduler():
    global _scheduler
    if _scheduler:
        return
    _scheduler = BackgroundScheduler(timezone="Asia/Seoul")
    # 매일 새벽 3시
    _scheduler.add_job(
        _run_promotion_detection,
        CronTrigger(hour=3, minute=0),
        id="promotion_detection",
        replace_existing=True,
    )
    _scheduler.start()
    print("[SCHEDULER] Started (daily 03:00 KST)")


def stop_scheduler():
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        print("[SCHEDULER] Stopped")


def trigger_promotion_detection_now():
    """수동 실행용 (테스트/디버깅)"""
    _run_promotion_detection()
