-- =====================================================================
-- Migration 003: Add per-user password salt
-- 생성일: 2026-08-28
-- 설명: users.password_hash가 salt 없는 단일 SHA-256(password)로 저장되어
--       테이블 유출 시 레인보우테이블 공격에 취약함. salt 컬럼을 추가하고,
--       robot-core/robot-back 둘 다 password_hash = SHA2(CONCAT(COALESCE(salt,''), password), 256)
--       방식으로 검증하도록 변경 (salt가 NULL인 기존 계정은 COALESCE(salt,'')='' 이므로
--       기존 해시가 그대로 유효 - 로그인 성공 시 자동으로 salt를 발급해 마이그레이션).
-- =====================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS salt VARCHAR(32) NULL DEFAULT NULL AFTER password_hash;
