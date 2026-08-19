from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field

from app.models.welding import Posture, DataSource, PromotionStatus, JobStatus, JobMode, ResumeType


# =====================================================================
# welding_params
# =====================================================================
class WeldingParamBase(BaseModel):
    posture: Posture
    gap_mm: Decimal = Field(ge=0, le=6)
    current_a: int = Field(gt=0)
    voltage_v: Decimal = Field(gt=0)
    speed_cpm: int = Field(gt=0)
    stickout_mm: int
    weave_enabled: bool = True
    weave_type: int = 0
    weave_freq_hz: Decimal = Decimal("1.5")
    weave_range_mm: Decimal = Decimal("3.0")
    weave_left_dwell_ms: int = 0
    weave_right_dwell_ms: int = 0
    material: str = "SS400"
    thickness_mm: Decimal
    joint_type: str = "fillet"
    source: DataSource = DataSource.lab
    notes: str | None = None


class WeldingParamCreate(WeldingParamBase):
    pass


class WeldingParamUpdate(BaseModel):
    current_a: int | None = None
    voltage_v: Decimal | None = None
    speed_cpm: int | None = None
    stickout_mm: int | None = None
    weave_enabled: bool | None = None
    weave_type: int | None = None
    weave_freq_hz: Decimal | None = None
    weave_range_mm: Decimal | None = None
    weave_left_dwell_ms: int | None = None
    weave_right_dwell_ms: int | None = None
    notes: str | None = None


class WeldingParamOut(WeldingParamBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    active: bool
    deactivated_at: datetime | None
    deactivated_by: int | None
    deactivation_reason: str | None
    created_at: datetime
    updated_at: datetime


class WeldingParamDeactivate(BaseModel):
    reason: str = Field(min_length=1)


class ParamLookupResult(BaseModel):
    matched: bool
    fallback_level: int
    warning: str | None = None
    param: WeldingParamOut | None = None
    candidates: list[WeldingParamOut] | None = None


# =====================================================================
# welding_defaults
# =====================================================================
class WeldingDefaultOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    gas_flow_lpm: Decimal
    preheat_sec: Decimal
    postheat_sec: Decimal
    updated_at: datetime


class WeldingDefaultUpdate(BaseModel):
    gas_flow_lpm: Decimal | None = None
    preheat_sec: Decimal | None = None
    postheat_sec: Decimal | None = None


# =====================================================================
# Jobs
# =====================================================================
class WeldingJobCreate(BaseModel):
    job_name: str | None = None
    cell_type: str | None = None
    mode: JobMode = JobMode.real
    dry_run_level: int | None = None
    speed_override_pct: int = 100
    notes: str | None = None


class WeldingJobUpdate(BaseModel):
    status: JobStatus | None = None
    notes: str | None = None
    completed_at: datetime | None = None


class WeldingJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_name: str | None
    cell_type: str | None
    status: JobStatus
    mode: JobMode
    dry_run_level: int | None
    speed_override_pct: int
    started_by: int | None
    started_at: datetime | None
    completed_at: datetime | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


# =====================================================================
# weld_point_gaps
# =====================================================================
class WeldPointGapCreate(BaseModel):
    point_code: str
    gap_mm: Decimal = Field(ge=0, le=6)
    posture: Posture
    thickness_mm: Decimal


class WeldPointGapBulkCreate(BaseModel):
    job_id: int
    points: list[WeldPointGapCreate]


class WeldPointGapOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_id: int
    point_code: str
    gap_mm: Decimal
    posture: Posture
    thickness_mm: Decimal
    created_at: datetime


# =====================================================================
# param_overrides
# =====================================================================
class ParamOverrideCreate(BaseModel):
    job_id: int
    point_code: str | None = None
    posture: Posture
    gap_mm: Decimal
    material: str | None = "SS400"
    thickness_mm: Decimal | None = None
    joint_type: str | None = "fillet"
    field_name: str
    original_value: Decimal
    override_value: Decimal
    reason: str | None = None


class ParamOverrideOut(ParamOverrideCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: datetime


# =====================================================================
# promotion_requests
# =====================================================================
class PromotionReviewRequest(BaseModel):
    action: str = Field(pattern="^(approve|reject)$")
    note: str | None = None


class PromotionRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    trigger_type: str
    posture: Posture
    gap_mm: Decimal
    material: str | None
    thickness_mm: Decimal | None
    joint_type: str | None
    field_name: str
    current_value: Decimal
    requested_value: Decimal
    override_count: int
    override_stddev_pct: Decimal | None
    operator_count: int | None
    reason: str | None
    status: PromotionStatus
    reviewed_by: int | None
    reviewer_note: str | None
    reviewed_at: datetime | None
    created_at: datetime


# =====================================================================
# deviation_events
# =====================================================================
class DeviationEventCreate(BaseModel):
    job_id: int
    point_code: str | None = None
    level: int = Field(ge=1, le=3)
    field_name: str
    command_value: Decimal
    actual_value: Decimal
    deviation_pct: Decimal
    duration_sec: Decimal
    action_taken: str | None = None


class DeviationEventOut(DeviationEventCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


# =====================================================================
# stop_events
# =====================================================================
class StopEventCreate(BaseModel):
    job_id: int
    reason: str
    stopped_point: str | None = None
    notes: str | None = None


class StopEventResume(BaseModel):
    resume_type: ResumeType
    notes: str | None = None


class StopEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_id: int
    reason: str
    stopped_at: datetime
    stopped_point: str | None
    resumed_at: datetime | None
    resumed_by: int | None
    resume_type: ResumeType | None
    approved_by: int | None
    stop_duration_sec: int | None
    notes: str | None


# =====================================================================
# alarm_thresholds & override_limits
# =====================================================================
class AlarmThresholdOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    field_name: str
    warn_pct: Decimal | None
    warn_duration_sec: Decimal | None
    alert_pct: Decimal | None
    alert_duration_sec: Decimal | None
    stop_pct: Decimal | None
    stop_duration_sec: Decimal | None


class AlarmThresholdUpdate(BaseModel):
    warn_pct: Decimal | None = None
    warn_duration_sec: Decimal | None = None
    alert_pct: Decimal | None = None
    alert_duration_sec: Decimal | None = None
    stop_pct: Decimal | None = None
    stop_duration_sec: Decimal | None = None


class OverrideLimitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    field_name: str
    max_up_pct: Decimal | None
    max_down_pct: Decimal | None


class OverrideLimitUpdate(BaseModel):
    max_up_pct: Decimal | None = None
    max_down_pct: Decimal | None = None


class PromotionDetectionConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    min_override_count: int
    max_stddev_pct: Decimal
    observation_days: int
    min_operator_count: int
    preferred_operator_count: int


class PromotionDetectionConfigUpdate(BaseModel):
    min_override_count: int | None = None
    max_stddev_pct: Decimal | None = None
    observation_days: int | None = None
    min_operator_count: int | None = None
    preferred_operator_count: int | None = None
