-- =====================================================================
-- Migration 002: Create robot_settings table (+ collision detection column)
-- 생성일: 2026-08-26
-- 설명: robot_settings 테이블이 DB에 존재하지 않아 CREATE TABLE부터 진행.
--       robot_core_all.cpp의 getRobotSettings/updateRobotSettings가 기대하는
--       컬럼 구성 그대로 생성하고, id=1 기본 행을 seed.
-- =====================================================================

CREATE TABLE IF NOT EXISTS robot_settings (
    id INT PRIMARY KEY,
    tool_num INT NOT NULL DEFAULT 0,
    user_num INT NOT NULL DEFAULT 0,
    default_vel INT NOT NULL DEFAULT 20,
    default_acc INT NOT NULL DEFAULT 100,
    default_ovl INT NOT NULL DEFAULT 100,
    auto_clear_error TINYINT(1) NOT NULL DEFAULT 1,
    min_weaving_distance INT NOT NULL DEFAULT 50,
    collision_detection_enabled TINYINT(1) NOT NULL DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO robot_settings (id) VALUES (1);
