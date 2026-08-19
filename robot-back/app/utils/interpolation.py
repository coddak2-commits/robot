"""갭 기반 파라미터 조회/보간 로직"""
from decimal import Decimal
from typing import Optional
from sqlalchemy.orm import Session

from app.models.welding import WeldingParam, Posture

GAP_MAX = Decimal("6.0")
GAP_MIN = Decimal("0.0")


def clamp_gap(gap: Decimal) -> tuple[Decimal, Optional[str]]:
    """갭 값을 0~6 범위로 클램프"""
    if gap > GAP_MAX:
        return GAP_MAX, f"Gap {gap}mm > 6mm, clamped to 6mm"
    if gap < GAP_MIN:
        raise ValueError("Gap cannot be negative")
    return gap, None


def _linear_interp(lower: WeldingParam, upper: WeldingParam, gap: Decimal) -> dict:
    """두 파라미터 사이 선형 보간"""
    span = upper.gap_mm - lower.gap_mm
    ratio = (gap - lower.gap_mm) / span if span > 0 else Decimal("0")

    def interp(a, b):
        return type(a)(a + (b - a) * ratio) if isinstance(a, (int, Decimal)) else b

    return {
        "current_a": int(lower.current_a + (upper.current_a - lower.current_a) * ratio),
        "voltage_v": lower.voltage_v + (upper.voltage_v - lower.voltage_v) * ratio,
        "speed_cpm": int(lower.speed_cpm + (upper.speed_cpm - lower.speed_cpm) * ratio),
        "stickout_mm": lower.stickout_mm,
        "weave_freq_hz": lower.weave_freq_hz,
        "weave_range_mm": lower.weave_range_mm + (upper.weave_range_mm - lower.weave_range_mm) * ratio,
        "weave_left_dwell_ms": lower.weave_left_dwell_ms,
        "weave_right_dwell_ms": lower.weave_right_dwell_ms,
    }


def lookup_exact(
    db: Session, posture: Posture, gap: Decimal,
    material: str, thickness: Decimal, joint: str,
) -> Optional[WeldingParam]:
    """정확 매치 조회"""
    return (
        db.query(WeldingParam)
        .filter(
            WeldingParam.active.is_(True),
            WeldingParam.posture == posture,
            WeldingParam.gap_mm == gap,
            WeldingParam.material == material,
            WeldingParam.thickness_mm == thickness,
            WeldingParam.joint_type == joint,
        )
        .first()
    )


def lookup_with_interpolation(
    db: Session, posture: Posture, gap: Decimal,
    material: str, thickness: Decimal, joint: str,
) -> Optional[dict]:
    """정확 매치 후, 없으면 인접 갭 값으로 보간"""
    exact = lookup_exact(db, posture, gap, material, thickness, joint)
    if exact:
        return {"matched": True, "param": exact, "interpolated": None}

    rows = (
        db.query(WeldingParam)
        .filter(
            WeldingParam.active.is_(True),
            WeldingParam.posture == posture,
            WeldingParam.material == material,
            WeldingParam.thickness_mm == thickness,
            WeldingParam.joint_type == joint,
        )
        .order_by(WeldingParam.gap_mm)
        .all()
    )
    if not rows:
        return None

    lower = max((r for r in rows if r.gap_mm < gap), key=lambda r: r.gap_mm, default=None)
    upper = min((r for r in rows if r.gap_mm > gap), key=lambda r: r.gap_mm, default=None)

    if lower and upper:
        return {
            "matched": False,
            "interpolated": _linear_interp(lower, upper, gap),
            "base_lower": lower,
            "base_upper": upper,
        }
    if lower:
        return {"matched": False, "param": lower, "interpolated": None}
    if upper:
        return {"matched": False, "param": upper, "interpolated": None}
    return None


def find_nearest_thickness(
    db: Session, posture: Posture, gap: Decimal,
    material: str, thickness: Decimal, joint: str,
    tolerance_pct: Decimal = Decimal("20"),
) -> Optional[WeldingParam]:
    """옵션 C 폴백 레벨 2: 두께 ±20% 이내에서 근접값 찾기"""
    lower_bound = thickness * (1 - tolerance_pct / 100)
    upper_bound = thickness * (1 + tolerance_pct / 100)
    candidates = (
        db.query(WeldingParam)
        .filter(
            WeldingParam.active.is_(True),
            WeldingParam.posture == posture,
            WeldingParam.gap_mm == gap,
            WeldingParam.material == material,
            WeldingParam.joint_type == joint,
            WeldingParam.thickness_mm >= lower_bound,
            WeldingParam.thickness_mm <= upper_bound,
        )
        .all()
    )
    if not candidates:
        return None
    return min(candidates, key=lambda r: abs(r.thickness_mm - thickness))


def find_similar_candidates(
    db: Session, posture: Posture, gap: Decimal,
    material: str, joint: str,
) -> list[WeldingParam]:
    """옵션 C 폴백 레벨 3: 자세/소재/이음/갭 일치하는 모든 두께 후보"""
    return (
        db.query(WeldingParam)
        .filter(
            WeldingParam.active.is_(True),
            WeldingParam.posture == posture,
            WeldingParam.gap_mm == gap,
            WeldingParam.material == material,
            WeldingParam.joint_type == joint,
        )
        .order_by(WeldingParam.thickness_mm)
        .all()
    )
