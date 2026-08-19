from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Boolean, Enum, TIMESTAMP, Integer, DECIMAL, Text, JSON, ForeignKey, SmallInteger
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
import enum

from app.core.database import Base


class Posture(str, enum.Enum):
    vertical = "vertical"
    horizontal = "horizontal"


class DataSource(str, enum.Enum):
    lab = "lab"
    field = "field"
    wps = "wps"


class JobStatus(str, enum.Enum):
    created = "created"
    ready = "ready"
    running = "running"
    paused = "paused"
    completed = "completed"
    failed = "failed"
    aborted = "aborted"


class JobMode(str, enum.Enum):
    real = "real"
    dry_run = "dry_run"


class PromotionStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    superseded = "superseded"


class ResumeType(str, enum.Enum):
    continue_ = "continue"
    backup = "backup"
    restart_section = "restart_section"


# =====================================================================
# welding_jobs
# =====================================================================
class WeldingJob(Base):
    __tablename__ = "welding_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_name: Mapped[str | None] = mapped_column(String(100))
    cell_type: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus), default=JobStatus.created)
    mode: Mapped[JobMode] = mapped_column(Enum(JobMode), default=JobMode.real)
    dry_run_level: Mapped[int | None] = mapped_column(SmallInteger)
    speed_override_pct: Mapped[int] = mapped_column(Integer, default=100)
    started_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    started_at: Mapped[datetime | None] = mapped_column(TIMESTAMP)
    completed_at: Mapped[datetime | None] = mapped_column(TIMESTAMP)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now(), onupdate=func.now())


# =====================================================================
# welding_params (핵심 테이블)
# =====================================================================
class WeldingParam(Base):
    __tablename__ = "welding_params"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    posture: Mapped[Posture] = mapped_column(Enum(Posture), nullable=False)
    gap_mm: Mapped[Decimal] = mapped_column(DECIMAL(3, 1), nullable=False)
    current_a: Mapped[int] = mapped_column(Integer, nullable=False)
    voltage_v: Mapped[Decimal] = mapped_column(DECIMAL(4, 1), nullable=False)
    speed_cpm: Mapped[int] = mapped_column(Integer, nullable=False)
    stickout_mm: Mapped[int] = mapped_column(Integer, nullable=False)
    weave_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    weave_type: Mapped[int] = mapped_column(Integer, default=0)
    weave_freq_hz: Mapped[Decimal] = mapped_column(DECIMAL(3, 1), default=Decimal("1.5"))
    weave_range_mm: Mapped[Decimal] = mapped_column(DECIMAL(3, 1), default=Decimal("3.0"))
    weave_left_dwell_ms: Mapped[int] = mapped_column(Integer, default=0)
    weave_right_dwell_ms: Mapped[int] = mapped_column(Integer, default=0)
    material: Mapped[str] = mapped_column(String(50), default="SS400")
    thickness_mm: Mapped[Decimal] = mapped_column(DECIMAL(4, 1), nullable=False)
    joint_type: Mapped[str] = mapped_column(String(30), default="fillet")
    source: Mapped[DataSource] = mapped_column(Enum(DataSource), default=DataSource.lab)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    deactivated_at: Mapped[datetime | None] = mapped_column(TIMESTAMP)
    deactivated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    deactivation_reason: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now(), onupdate=func.now())


# =====================================================================
# welding_defaults (단일 행)
# =====================================================================
class WeldingDefault(Base):
    __tablename__ = "welding_defaults"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    gas_flow_lpm: Mapped[Decimal] = mapped_column(DECIMAL(4, 1), default=Decimal("15.0"))
    preheat_sec: Mapped[Decimal] = mapped_column(DECIMAL(3, 1), default=Decimal("2.0"))
    postheat_sec: Mapped[Decimal] = mapped_column(DECIMAL(3, 1), default=Decimal("3.0"))
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now(), onupdate=func.now())


# =====================================================================
# param_overrides
# =====================================================================
class ParamOverride(Base):
    __tablename__ = "param_overrides"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("welding_jobs.id", ondelete="CASCADE"), nullable=False)
    point_code: Mapped[str | None] = mapped_column(String(10))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    posture: Mapped[Posture] = mapped_column(Enum(Posture), nullable=False)
    gap_mm: Mapped[Decimal] = mapped_column(DECIMAL(3, 1), nullable=False)
    material: Mapped[str | None] = mapped_column(String(50))
    thickness_mm: Mapped[Decimal | None] = mapped_column(DECIMAL(4, 1))
    joint_type: Mapped[str | None] = mapped_column(String(30))
    field_name: Mapped[str] = mapped_column(String(50), nullable=False)
    original_value: Mapped[Decimal] = mapped_column(DECIMAL(8, 2), nullable=False)
    override_value: Mapped[Decimal] = mapped_column(DECIMAL(8, 2), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())


# =====================================================================
# promotion_requests
# =====================================================================
class PromotionRequest(Base):
    __tablename__ = "promotion_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    trigger_type: Mapped[str] = mapped_column(String(20), default="auto_detect")
    posture: Mapped[Posture] = mapped_column(Enum(Posture), nullable=False)
    gap_mm: Mapped[Decimal] = mapped_column(DECIMAL(3, 1), nullable=False)
    material: Mapped[str | None] = mapped_column(String(50))
    thickness_mm: Mapped[Decimal | None] = mapped_column(DECIMAL(4, 1))
    joint_type: Mapped[str | None] = mapped_column(String(30))
    field_name: Mapped[str] = mapped_column(String(50), nullable=False)
    current_value: Mapped[Decimal] = mapped_column(DECIMAL(8, 2), nullable=False)
    requested_value: Mapped[Decimal] = mapped_column(DECIMAL(8, 2), nullable=False)
    override_count: Mapped[int] = mapped_column(Integer, nullable=False)
    override_stddev_pct: Mapped[Decimal | None] = mapped_column(DECIMAL(5, 2))
    operator_count: Mapped[int | None] = mapped_column(Integer)
    related_jobs: Mapped[dict | None] = mapped_column(JSON)
    reason: Mapped[str | None] = mapped_column(Text)
    status: Mapped[PromotionStatus] = mapped_column(Enum(PromotionStatus), default=PromotionStatus.pending)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    reviewer_note: Mapped[str | None] = mapped_column(Text)
    reviewed_at: Mapped[datetime | None] = mapped_column(TIMESTAMP)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())


# =====================================================================
# 설정 테이블들
# =====================================================================
class PromotionDetectionConfig(Base):
    __tablename__ = "promotion_detection_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    min_override_count: Mapped[int] = mapped_column(Integer, default=10)
    max_stddev_pct: Mapped[Decimal] = mapped_column(DECIMAL(4, 1), default=Decimal("5.0"))
    observation_days: Mapped[int] = mapped_column(Integer, default=30)
    min_operator_count: Mapped[int] = mapped_column(Integer, default=1)
    preferred_operator_count: Mapped[int] = mapped_column(Integer, default=2)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now(), onupdate=func.now())


class AlarmThreshold(Base):
    __tablename__ = "alarm_thresholds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    field_name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    warn_pct: Mapped[Decimal | None] = mapped_column(DECIMAL(4, 1))
    warn_duration_sec: Mapped[Decimal | None] = mapped_column(DECIMAL(4, 1))
    alert_pct: Mapped[Decimal | None] = mapped_column(DECIMAL(4, 1))
    alert_duration_sec: Mapped[Decimal | None] = mapped_column(DECIMAL(4, 1))
    stop_pct: Mapped[Decimal | None] = mapped_column(DECIMAL(4, 1))
    stop_duration_sec: Mapped[Decimal | None] = mapped_column(DECIMAL(4, 1))
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now(), onupdate=func.now())


class OverrideLimit(Base):
    __tablename__ = "override_limits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    field_name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    max_up_pct: Mapped[Decimal | None] = mapped_column(DECIMAL(4, 1))
    max_down_pct: Mapped[Decimal | None] = mapped_column(DECIMAL(4, 1))
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now(), onupdate=func.now())


# =====================================================================
# 이벤트 로그
# =====================================================================
class DeviationEvent(Base):
    __tablename__ = "deviation_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("welding_jobs.id", ondelete="CASCADE"), nullable=False)
    point_code: Mapped[str | None] = mapped_column(String(10))
    level: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    field_name: Mapped[str] = mapped_column(String(50), nullable=False)
    command_value: Mapped[Decimal] = mapped_column(DECIMAL(6, 2), nullable=False)
    actual_value: Mapped[Decimal] = mapped_column(DECIMAL(6, 2), nullable=False)
    deviation_pct: Mapped[Decimal] = mapped_column(DECIMAL(5, 2), nullable=False)
    duration_sec: Mapped[Decimal] = mapped_column(DECIMAL(5, 2), nullable=False)
    action_taken: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())


class StopEvent(Base):
    __tablename__ = "stop_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("welding_jobs.id", ondelete="CASCADE"), nullable=False)
    reason: Mapped[str] = mapped_column(String(50), nullable=False)
    stopped_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())
    stopped_point: Mapped[str | None] = mapped_column(String(10))
    resumed_at: Mapped[datetime | None] = mapped_column(TIMESTAMP)
    resumed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    resume_type: Mapped[ResumeType | None] = mapped_column(Enum(ResumeType))
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    stop_duration_sec: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)


class FallbackUsage(Base):
    __tablename__ = "fallback_usage"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("welding_jobs.id", ondelete="CASCADE"), nullable=False)
    requested: Mapped[dict] = mapped_column(JSON, nullable=False)
    fallback_used: Mapped[dict] = mapped_column(JSON, nullable=False)
    fallback_level: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    warning_shown: Mapped[str | None] = mapped_column(String(20))
    user_confirmed: Mapped[bool | None] = mapped_column(Boolean)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())


class WeldPointGap(Base):
    __tablename__ = "weld_point_gaps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("welding_jobs.id", ondelete="CASCADE"), nullable=False)
    point_code: Mapped[str] = mapped_column(String(10), nullable=False)
    gap_mm: Mapped[Decimal] = mapped_column(DECIMAL(3, 1), nullable=False)
    posture: Mapped[Posture] = mapped_column(Enum(Posture), nullable=False)
    thickness_mm: Mapped[Decimal] = mapped_column(DECIMAL(4, 1), nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())
