"""오버라이드 승격 자동 감지 로직"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from statistics import mean, stdev
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.welding import (
    ParamOverride, PromotionRequest, PromotionDetectionConfig, PromotionStatus,
    WeldingParam,
)


def detect_promotion_candidates(db: Session) -> list[dict]:
    """반복 오버라이드 패턴을 감지해 승격 후보 생성.
    매일 새벽 배치로 실행됨.
    이미 pending 상태인 동일 조건 요청은 건너뜀.
    """
    cfg = db.query(PromotionDetectionConfig).first()
    if not cfg:
        return []

    since = datetime.now(timezone.utc) - timedelta(days=cfg.observation_days)

    # 조건별 그룹핑
    rows = (
        db.query(ParamOverride)
        .filter(ParamOverride.created_at >= since)
        .all()
    )
    if not rows:
        return []

    groups: dict[tuple, list[ParamOverride]] = {}
    for r in rows:
        key = (r.posture, r.gap_mm, r.material, r.thickness_mm, r.joint_type, r.field_name)
        groups.setdefault(key, []).append(r)

    created_requests = []
    for key, items in groups.items():
        if len(items) < cfg.min_override_count:
            continue

        # 표준편차 (%)
        values = [float(x.override_value) for x in items]
        avg = mean(values)
        if avg == 0:
            continue
        if len(values) < 2:
            stddev_pct = Decimal("0")
        else:
            stddev_pct = Decimal(str(stdev(values) / avg * 100))

        if stddev_pct > cfg.max_stddev_pct:
            continue

        operator_ids = {x.user_id for x in items}
        if len(operator_ids) < cfg.min_operator_count:
            continue

        posture, gap_mm, material, thickness_mm, joint_type, field_name = key
        current_value = items[0].original_value  # 대푯값
        requested_value = Decimal(str(round(avg, 2)))

        # 이미 pending 요청 있는지 확인
        exists = (
            db.query(PromotionRequest)
            .filter(
                PromotionRequest.status == PromotionStatus.pending,
                PromotionRequest.posture == posture,
                PromotionRequest.gap_mm == gap_mm,
                PromotionRequest.material == material,
                PromotionRequest.thickness_mm == thickness_mm,
                PromotionRequest.joint_type == joint_type,
                PromotionRequest.field_name == field_name,
            )
            .first()
        )
        if exists:
            continue

        # DB 현재값 조회 (없으면 skip)
        param = (
            db.query(WeldingParam)
            .filter(
                WeldingParam.active.is_(True),
                WeldingParam.posture == posture,
                WeldingParam.gap_mm == gap_mm,
                WeldingParam.material == material,
                WeldingParam.thickness_mm == thickness_mm,
                WeldingParam.joint_type == joint_type,
            )
            .first()
        )
        if not param:
            continue
        current_value = getattr(param, field_name, current_value)

        related_jobs = list({x.job_id for x in items})[:20]
        reason = (
            f"최근 {cfg.observation_days}일간 {len(items)}회 오버라이드, "
            f"표준편차 {stddev_pct:.1f}%, 작업자 {len(operator_ids)}명"
        )

        req = PromotionRequest(
            trigger_type="auto_detect",
            posture=posture,
            gap_mm=gap_mm,
            material=material,
            thickness_mm=thickness_mm,
            joint_type=joint_type,
            field_name=field_name,
            current_value=Decimal(str(current_value)),
            requested_value=requested_value,
            override_count=len(items),
            override_stddev_pct=stddev_pct,
            operator_count=len(operator_ids),
            related_jobs=related_jobs,
            reason=reason,
            status=PromotionStatus.pending,
        )
        # DB unique 제약(pending_dedupe_key)으로 동시 실행 시 중복 삽입을 최종 방어.
        # savepoint로 감싸서 충돌 시 이 요청만 건너뛰고 나머지 배치는 유지.
        try:
            with db.begin_nested():
                db.add(req)
                db.flush()
        except IntegrityError:
            continue
        created_requests.append({
            "condition": f"{posture.value}/{gap_mm}mm/{material}/{thickness_mm}mm/{joint_type}",
            "field": field_name,
            "count": len(items),
        })

    db.commit()
    return created_requests
