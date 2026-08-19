-- =====================================================================
-- Migration 001: Initial Schema
-- 생성일: 2026-08-14
-- 설명: FR3-WMS 갭 기반 파라미터 시스템 초기 스키마
--
-- 본 마이그레이션은 init_mariadb.sql과 동일한 내용
-- 향후 스키마 변경은 002, 003 순번으로 추가
-- =====================================================================

-- init_mariadb.sql의 내용과 동일하므로 SOURCE 명령으로 불러오기
-- 또는 init_mariadb.sql을 직접 실행

-- 마이그레이션 이력 테이블 (신규 - 마이그레이션 관리용)
CREATE TABLE IF NOT EXISTS schema_migrations (
    version         VARCHAR(20) PRIMARY KEY,
    description     TEXT,
    applied_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_migrations (version, description) VALUES
    ('001', 'Initial schema: welding_params, defaults, overrides, promotions, deviations, thresholds, limits, stops, fallbacks, point gaps, users, jobs');
