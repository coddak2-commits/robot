-- =====================================================================
-- FR3-WMS welding_params 초기 시드 데이터
-- 총 56행 = 자세 2 × 갭 7 × 두께 4 × SS400 × 필릿
--
-- 기준 데이터:
--   수직(3G): Lab 표10 대표값 사용
--   수평(2G): Lab 표11 대표값 사용
-- 두께 4종(18/20/22/23mm)에 동일 값 매핑 → 현장 실측으로 갱신 예정
-- Gap 0/4/6mm은 잠정값 (TBD - 신규 실측 필요)
--
-- 실행 방법:
--   USE robot_welding;
--   SOURCE seed_data.sql;
-- =====================================================================

USE robot_welding;

-- 기존 seed 데이터가 있으면 삭제 (재실행 시)
-- DELETE FROM welding_params WHERE source = 'lab';

-- =====================================================================
-- 수직 (vertical, 3G) - Lab 표10 기준
-- Lab 검증: gap 1/2/3/5mm
-- 신규 실측 필요: gap 0/4/6mm
-- =====================================================================
INSERT INTO welding_params (posture, gap_mm, current_a, voltage_v, speed_cpm, stickout_mm,
    weave_enabled, weave_type, weave_freq_hz, weave_range_mm, weave_left_dwell_ms, weave_right_dwell_ms,
    material, thickness_mm, joint_type, source, notes) VALUES

-- 두께 18mm × 갭 7종
('vertical', 0.0, 220, 25.5, 15, 20, TRUE, 0, 1.5, 2.5, 0, 0, 'SS400', 18.0, 'fillet', 'lab', 'TBD - 신규 실측 필요 (밀착 이음)'),
('vertical', 1.0, 210, 25.0, 15, 20, TRUE, 0, 1.5, 3.0, 0, 0, 'SS400', 18.0, 'fillet', 'lab', 'Lab 표10 대표값 (0.35 kJ/mm)'),
('vertical', 2.0, 200, 24.0, 15, 20, TRUE, 0, 1.5, 3.5, 0, 0, 'SS400', 18.0, 'fillet', 'lab', 'Lab 표10 대표값'),
('vertical', 3.0, 200, 24.0, 15, 20, TRUE, 0, 1.5, 4.0, 0, 0, 'SS400', 18.0, 'fillet', 'lab', 'Lab 표10 대표값'),
('vertical', 4.0, 200, 24.0, 16, 20, TRUE, 0, 1.5, 4.5, 100, 100, 'SS400', 18.0, 'fillet', 'lab', 'TBD - 3과 5 사이 보간'),
('vertical', 5.0, 200, 24.0, 17, 20, TRUE, 0, 1.5, 5.0, 200, 200, 'SS400', 18.0, 'fillet', 'lab', 'Lab 표10 대표값'),
('vertical', 6.0, 200, 24.0, 17, 20, TRUE, 0, 1.5, 5.5, 300, 300, 'SS400', 18.0, 'fillet', 'lab', 'TBD - 싱글패스+위빙, 신규 실측'),

-- 두께 20mm × 갭 7종 (18mm과 동일 값으로 초기 매핑)
('vertical', 0.0, 220, 25.5, 15, 20, TRUE, 0, 1.5, 2.5, 0, 0, 'SS400', 20.0, 'fillet', 'lab', 'TBD - 신규 실측 필요'),
('vertical', 1.0, 210, 25.0, 15, 20, TRUE, 0, 1.5, 3.0, 0, 0, 'SS400', 20.0, 'fillet', 'lab', 'Lab 표10 값 매핑 (실측 갱신 예정)'),
('vertical', 2.0, 200, 24.0, 15, 20, TRUE, 0, 1.5, 3.5, 0, 0, 'SS400', 20.0, 'fillet', 'lab', 'Lab 표10 값 매핑'),
('vertical', 3.0, 200, 24.0, 15, 20, TRUE, 0, 1.5, 4.0, 0, 0, 'SS400', 20.0, 'fillet', 'lab', 'Lab 표10 값 매핑'),
('vertical', 4.0, 200, 24.0, 16, 20, TRUE, 0, 1.5, 4.5, 100, 100, 'SS400', 20.0, 'fillet', 'lab', 'TBD - 보간'),
('vertical', 5.0, 200, 24.0, 17, 20, TRUE, 0, 1.5, 5.0, 200, 200, 'SS400', 20.0, 'fillet', 'lab', 'Lab 표10 값 매핑'),
('vertical', 6.0, 200, 24.0, 17, 20, TRUE, 0, 1.5, 5.5, 300, 300, 'SS400', 20.0, 'fillet', 'lab', 'TBD - 싱글패스+위빙'),

-- 두께 22mm × 갭 7종
('vertical', 0.0, 220, 25.5, 15, 20, TRUE, 0, 1.5, 2.5, 0, 0, 'SS400', 22.0, 'fillet', 'lab', 'TBD - 신규 실측 필요'),
('vertical', 1.0, 210, 25.0, 15, 20, TRUE, 0, 1.5, 3.0, 0, 0, 'SS400', 22.0, 'fillet', 'lab', 'Lab 표10 값 매핑'),
('vertical', 2.0, 200, 24.0, 15, 20, TRUE, 0, 1.5, 3.5, 0, 0, 'SS400', 22.0, 'fillet', 'lab', 'Lab 표10 값 매핑'),
('vertical', 3.0, 200, 24.0, 15, 20, TRUE, 0, 1.5, 4.0, 0, 0, 'SS400', 22.0, 'fillet', 'lab', 'Lab 표10 값 매핑'),
('vertical', 4.0, 200, 24.0, 16, 20, TRUE, 0, 1.5, 4.5, 100, 100, 'SS400', 22.0, 'fillet', 'lab', 'TBD - 보간'),
('vertical', 5.0, 200, 24.0, 17, 20, TRUE, 0, 1.5, 5.0, 200, 200, 'SS400', 22.0, 'fillet', 'lab', 'Lab 표10 값 매핑'),
('vertical', 6.0, 200, 24.0, 17, 20, TRUE, 0, 1.5, 5.5, 300, 300, 'SS400', 22.0, 'fillet', 'lab', 'TBD - 싱글패스+위빙'),

-- 두께 23mm × 갭 7종
('vertical', 0.0, 220, 25.5, 15, 20, TRUE, 0, 1.5, 2.5, 0, 0, 'SS400', 23.0, 'fillet', 'lab', 'TBD - 신규 실측 필요'),
('vertical', 1.0, 210, 25.0, 15, 20, TRUE, 0, 1.5, 3.0, 0, 0, 'SS400', 23.0, 'fillet', 'lab', 'Lab 표10 값 매핑'),
('vertical', 2.0, 200, 24.0, 15, 20, TRUE, 0, 1.5, 3.5, 0, 0, 'SS400', 23.0, 'fillet', 'lab', 'Lab 표10 값 매핑'),
('vertical', 3.0, 200, 24.0, 15, 20, TRUE, 0, 1.5, 4.0, 0, 0, 'SS400', 23.0, 'fillet', 'lab', 'Lab 표10 값 매핑'),
('vertical', 4.0, 200, 24.0, 16, 20, TRUE, 0, 1.5, 4.5, 100, 100, 'SS400', 23.0, 'fillet', 'lab', 'TBD - 보간'),
('vertical', 5.0, 200, 24.0, 17, 20, TRUE, 0, 1.5, 5.0, 200, 200, 'SS400', 23.0, 'fillet', 'lab', 'Lab 표10 값 매핑'),
('vertical', 6.0, 200, 24.0, 17, 20, TRUE, 0, 1.5, 5.5, 300, 300, 'SS400', 23.0, 'fillet', 'lab', 'TBD - 싱글패스+위빙');

-- =====================================================================
-- 수평 (horizontal, 2G) - Lab 표11 기준
-- Lab 검증: gap 1/2mm
-- 신규 실측 필요: gap 0/3/4/5/6mm
-- =====================================================================
INSERT INTO welding_params (posture, gap_mm, current_a, voltage_v, speed_cpm, stickout_mm,
    weave_enabled, weave_type, weave_freq_hz, weave_range_mm, weave_left_dwell_ms, weave_right_dwell_ms,
    material, thickness_mm, joint_type, source, notes) VALUES

-- 두께 18mm × 갭 7종
('horizontal', 0.0, 290, 28.5, 28, 45, TRUE, 0, 1.5, 2.5, 0, 0, 'SS400', 18.0, 'fillet', 'lab', 'TBD - 신규 실측 필요'),
('horizontal', 1.0, 280, 28.0, 28, 45, TRUE, 0, 1.5, 3.0, 0, 0, 'SS400', 18.0, 'fillet', 'lab', 'Lab 표11 대표값 (0.28 kJ/mm)'),
('horizontal', 2.0, 210, 28.0, 28, 45, TRUE, 0, 1.5, 3.5, 0, 0, 'SS400', 18.0, 'fillet', 'lab', 'Lab 표11 대표값'),
('horizontal', 3.0, 220, 28.0, 25, 45, TRUE, 0, 1.5, 4.0, 100, 100, 'SS400', 18.0, 'fillet', 'lab', 'TBD - 신규 실측 필요'),
('horizontal', 4.0, 220, 28.0, 22, 45, TRUE, 0, 1.5, 4.5, 200, 200, 'SS400', 18.0, 'fillet', 'lab', 'TBD - 신규 실측 필요'),
('horizontal', 5.0, 220, 28.0, 20, 45, TRUE, 0, 1.5, 5.0, 300, 300, 'SS400', 18.0, 'fillet', 'lab', 'TBD - 신규 실측 필요'),
('horizontal', 6.0, 220, 28.0, 18, 45, TRUE, 0, 1.5, 5.5, 400, 400, 'SS400', 18.0, 'fillet', 'lab', 'TBD - 싱글패스+위빙, 실측 필요'),

-- 두께 20mm × 갭 7종
('horizontal', 0.0, 290, 28.5, 28, 45, TRUE, 0, 1.5, 2.5, 0, 0, 'SS400', 20.0, 'fillet', 'lab', 'TBD - 신규 실측 필요'),
('horizontal', 1.0, 280, 28.0, 28, 45, TRUE, 0, 1.5, 3.0, 0, 0, 'SS400', 20.0, 'fillet', 'lab', 'Lab 표11 값 매핑'),
('horizontal', 2.0, 210, 28.0, 28, 45, TRUE, 0, 1.5, 3.5, 0, 0, 'SS400', 20.0, 'fillet', 'lab', 'Lab 표11 값 매핑'),
('horizontal', 3.0, 220, 28.0, 25, 45, TRUE, 0, 1.5, 4.0, 100, 100, 'SS400', 20.0, 'fillet', 'lab', 'TBD - 실측'),
('horizontal', 4.0, 220, 28.0, 22, 45, TRUE, 0, 1.5, 4.5, 200, 200, 'SS400', 20.0, 'fillet', 'lab', 'TBD - 실측'),
('horizontal', 5.0, 220, 28.0, 20, 45, TRUE, 0, 1.5, 5.0, 300, 300, 'SS400', 20.0, 'fillet', 'lab', 'TBD - 실측'),
('horizontal', 6.0, 220, 28.0, 18, 45, TRUE, 0, 1.5, 5.5, 400, 400, 'SS400', 20.0, 'fillet', 'lab', 'TBD - 싱글패스+위빙'),

-- 두께 22mm × 갭 7종
('horizontal', 0.0, 290, 28.5, 28, 45, TRUE, 0, 1.5, 2.5, 0, 0, 'SS400', 22.0, 'fillet', 'lab', 'TBD - 신규 실측 필요'),
('horizontal', 1.0, 280, 28.0, 28, 45, TRUE, 0, 1.5, 3.0, 0, 0, 'SS400', 22.0, 'fillet', 'lab', 'Lab 표11 값 매핑'),
('horizontal', 2.0, 210, 28.0, 28, 45, TRUE, 0, 1.5, 3.5, 0, 0, 'SS400', 22.0, 'fillet', 'lab', 'Lab 표11 값 매핑'),
('horizontal', 3.0, 220, 28.0, 25, 45, TRUE, 0, 1.5, 4.0, 100, 100, 'SS400', 22.0, 'fillet', 'lab', 'TBD - 실측'),
('horizontal', 4.0, 220, 28.0, 22, 45, TRUE, 0, 1.5, 4.5, 200, 200, 'SS400', 22.0, 'fillet', 'lab', 'TBD - 실측'),
('horizontal', 5.0, 220, 28.0, 20, 45, TRUE, 0, 1.5, 5.0, 300, 300, 'SS400', 22.0, 'fillet', 'lab', 'TBD - 실측'),
('horizontal', 6.0, 220, 28.0, 18, 45, TRUE, 0, 1.5, 5.5, 400, 400, 'SS400', 22.0, 'fillet', 'lab', 'TBD - 싱글패스+위빙'),

-- 두께 23mm × 갭 7종
('horizontal', 0.0, 290, 28.5, 28, 45, TRUE, 0, 1.5, 2.5, 0, 0, 'SS400', 23.0, 'fillet', 'lab', 'TBD - 신규 실측 필요'),
('horizontal', 1.0, 280, 28.0, 28, 45, TRUE, 0, 1.5, 3.0, 0, 0, 'SS400', 23.0, 'fillet', 'lab', 'Lab 표11 값 매핑'),
('horizontal', 2.0, 210, 28.0, 28, 45, TRUE, 0, 1.5, 3.5, 0, 0, 'SS400', 23.0, 'fillet', 'lab', 'Lab 표11 값 매핑'),
('horizontal', 3.0, 220, 28.0, 25, 45, TRUE, 0, 1.5, 4.0, 100, 100, 'SS400', 23.0, 'fillet', 'lab', 'TBD - 실측'),
('horizontal', 4.0, 220, 28.0, 22, 45, TRUE, 0, 1.5, 4.5, 200, 200, 'SS400', 23.0, 'fillet', 'lab', 'TBD - 실측'),
('horizontal', 5.0, 220, 28.0, 20, 45, TRUE, 0, 1.5, 5.0, 300, 300, 'SS400', 23.0, 'fillet', 'lab', 'TBD - 실측'),
('horizontal', 6.0, 220, 28.0, 18, 45, TRUE, 0, 1.5, 5.5, 400, 400, 'SS400', 23.0, 'fillet', 'lab', 'TBD - 싱글패스+위빙');

-- =====================================================================
-- 확인 쿼리
-- =====================================================================
-- SELECT posture, thickness_mm, COUNT(*) FROM welding_params GROUP BY posture, thickness_mm;
-- 예상 결과: 자세 2 × 두께 4 = 8개 그룹, 각 7행, 총 56행
