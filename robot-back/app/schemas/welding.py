from typing import Optional
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.welding import Posture, DataSource, PromotionStatus, JobStatus, JobMode, ResumeType

# 오버라이드/승격이 setattr로 직접 수정할 수 있는 welding_params 컬럼 화이트리스트.
# 여기 없는 필드명(id, active 등 임의 컬럼)은 오버라이드/승격 대상이 될 수 없음.
ALLOWED_OVERRIDE_FIELDS = frozenset({
    "current_a",
    "voltage_v",
    "speed_cpm",
    "stickout_mm",
    "weave_freq_hz",
    "weave_range_mm",
    "weave_left_dwell_ms",
    "weave_right_dwell_ms",
})


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
    notes: Optional[str] = None


class WeldingParamCreate(WeldingParamBase):
    pass


class WeldingParamUpdate(BaseModel):
    current_a: Optional[int] = Field(default=None, gt=0)
    voltage_v: Optional[Decimal] = Field(default=None, gt=0)
    speed_cpm: Optional[int] = Field(default=None, gt=0)
    stickout_mm: Optional[int] = Field(default=None, ge=0)
    weave_enabled: Optional[bool] = None
    weave_type: Optional[int] = None
    weave_freq_hz: Optional[Decimal] = Field(default=None, gt=0)
    weave_range_mm: Optional[Decimal] = Field(default=None, gt=0)
    weave_left_dwell_ms: Optional[int] = Field(default=None, ge=0)
    weave_right_dwell_ms: Optional[int] = Field(default=None, ge=0)
    notes: Optional[str] = None


class WeldingParamOut(WeldingParamBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    active: bool
    deactivated_at: Optional[datetime]
    deactivated_by: Optional[int]
    deactivation_reason: Optional[str]
    created_at: datetime
    updated_at: datetime


class WeldingParamDeactivate(BaseModel):
    reason: str = Field(min_length=1)


class ParamLookupResult(BaseModel):
    matched: bool
    fallback_level: int
    warning: Optional[str] = None
    param: Optional[WeldingParamOut] = None
    candidates: Optional[list[WeldingParamOut]] = None


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
    gas_flow_lpm: Optional[Decimal] = None
    preheat_sec: Optional[Decimal] = None
    postheat_sec: Optional[Decimal] = None


# =====================================================================
# Jobs
# =====================================================================
class WeldingJobCreate(BaseModel):
    job_name: Optional[str] = None
    cell_type: Optional[str] = None
    mode: JobMode = JobMode.real
    dry_run_level: Optional[int] = None
    speed_override_pct: int = 100
    notes: Optional[str] = None


class WeldingJobUpdate(BaseModel):
    status: Optional[JobStatus] = None
    notes: Optional[str] = None
    completed_at: Optional[datetime] = None


class WeldingJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_name: Optional[str]
    cell_type: Optional[str]
    status: JobStatus
    mode: JobMode
    dry_run_level: Optional[int]
    speed_override_pct: int
    started_by: Optional[int]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    notes: Optional[str]
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
    point_code: Optional[str] = None
    posture: Posture
    gap_mm: Decimal
    material: Optional[str] = "SS400"
    thickness_mm: Optional[Decimal] = None
    joint_type: Optional[str] = "fillet"
    field_name: str
    original_value: Decimal
    override_value: Decimal
    reason: Optional[str] = None

    @field_validator("field_name")
    @classmethod
    def _validate_field_name(cls, v: str) -> str:
        if v not in ALLOWED_OVERRIDE_FIELDS:
            raise ValueError(f"field_name must be one of {sorted(ALLOWED_OVERRIDE_FIELDS)}")
        return v


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
    note: Optional[str] = None


class PromotionRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    trigger_type: str
    posture: Posture
    gap_mm: Decimal
    material: Optional[str]
    thickness_mm: Optional[Decimal]
    joint_type: Optional[str]
    field_name: str
    current_value: Decimal
    requested_value: Decimal
    override_count: int
    override_stddev_pct: Optional[Decimal]
    operator_count: Optional[int]
    reason: Optional[str]
    status: PromotionStatus
    reviewed_by: Optional[int]
    reviewer_note: Optional[str]
    reviewed_at: Optional[datetime]
    created_at: datetime


# =====================================================================
# deviation_events
# =====================================================================
class DeviationEventCreate(BaseModel):
    job_id: int
    point_code: Optional[str] = None
    level: int = Field(ge=1, le=3)
    field_name: str
    command_value: Decimal
    actual_value: Decimal
    deviation_pct: Decimal
    duration_sec: Decimal
    action_taken: Optional[str] = None


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
    stopped_point: Optional[str] = None
    notes: Optional[str] = None


class StopEventResume(BaseModel):
    resume_type: ResumeType
    notes: Optional[str] = None


class StopEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_id: int
    reason: str
    stopped_at: datetime
    stopped_point: Optional[str]
    resumed_at: Optional[datetime]
    resumed_by: Optional[int]
    resume_type: Optional[ResumeType]
    approved_by: Optional[int]
    stop_duration_sec: Optional[int]
    notes: Optional[str]


# =====================================================================
# alarm_thresholds & override_limits
# =====================================================================
class AlarmThresholdOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    field_name: str
    warn_pct: Optional[Decimal]
    warn_duration_sec: Optional[Decimal]
    alert_pct: Optional[Decimal]
    alert_duration_sec: Optional[Decimal]
    stop_pct: Optional[Decimal]
    stop_duration_sec: Optional[Decimal]


class AlarmThresholdUpdate(BaseModel):
    warn_pct: Optional[Decimal] = None
    warn_duration_sec: Optional[Decimal] = None
    alert_pct: Optional[Decimal] = None
    alert_duration_sec: Optional[Decimal] = None
    stop_pct: Optional[Decimal] = None
    stop_duration_sec: Optional[Decimal] = None


class OverrideLimitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    field_name: str
    max_up_pct: Optional[Decimal]
    max_down_pct: Optional[Decimal]


class OverrideLimitUpdate(BaseModel):
    max_up_pct: Optional[Decimal] = None
    max_down_pct: Optional[Decimal] = None


class PromotionDetectionConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    min_override_count: int
    max_stddev_pct: Decimal
    observation_days: int
    min_operator_count: int
    preferred_operator_count: int


class PromotionDetectionConfigUpdate(BaseModel):
    min_override_count: Optional[int] = None
    max_stddev_pct: Optional[Decimal] = None
    observation_days: Optional[int] = None
    min_operator_count: Optional[int] = None
    preferred_operator_count: Optional[int] = None
