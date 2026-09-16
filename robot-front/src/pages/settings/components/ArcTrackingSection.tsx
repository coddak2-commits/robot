import React, { useState, useEffect } from 'react';
import { Settings, Mail, FileArchive, Cpu, AlertCircle, RefreshCw, CheckCircle, XCircle, Sliders, Shield, Globe, Clock, Moon, Sun, Bell, Bug, Download, Info, Users, User, Plus, Trash2, Edit, LogOut, X, Save, ChevronRight, History } from 'lucide-react';
import type { TouchSensingSettings, SystemConfig, RobotSettingsData, RobotErrorData, RobotErrorEvent, VersionInfo, UpdateCheckResponse, UpdateStatus, SystemInfo, UserData, UserFormData } from '..';
import { sendDiagnosticLogsEmail, downloadLogsZipUrl, updateRobotSettings, getRobotErrorHistory } from '../../../lib';
import { SettingsToggleRow } from '../../../components/common/index';
import { formatDateTime } from '../../../utils';
import { useNavigate } from 'react-router-dom';
import { useTheme, useLang, useUpdaterContext } from '../../../contexts';
import { setSoundEnabled, setAutoLogoutMinutes, setNotificationsEnabled } from '../../../lib/appSettings';
import { percent, displayProgress } from '../../../lib/updater';
import { NumberInput } from './TouchSensingSection';

interface ArcTrackingSectionProps {
  settings: TouchSensingSettings;
  updateTouch: (field: keyof TouchSensingSettings, value: boolean | number) => void;
}
const ArcTrackingDetails: React.FC<ArcTrackingSectionProps> = ({ settings, updateTouch }) => (
  <div
    className="grid grid-cols-1 md:grid-cols-2 gap-6"
    data-audit="dup"
    data-audit-note="중복: 아크 트래킹 설정 — /settings 와 /settings/welding(SequenceTab)가 동일 welding_config 편집"
    data-audit-loc="src/pages/settings/components/ArcTrackingSection.tsx:18"
  >
    {}
    <div className="bg-gray-800/50 rounded-xl p-4 space-y-3">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.arc_tracking_left_right}
          onChange={e => updateTouch('arc_tracking_left_right', e.target.checked)}
          className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-orange-500 focus:ring-orange-500 focus:ring-offset-gray-800"
        />
        <span className="text-white font-medium">좌우 보정</span>
      </label>
      {settings.arc_tracking_left_right && (
        <div className="pl-8 space-y-3">
          <NumberInput
            label="감도 계수 (Klr)"
            value={settings.arc_tracking_klr}
            onChange={v => updateTouch('arc_tracking_klr', v)}
            step={0.01}
            min={0.01}
            max={1}
            hint="0.01~1.0 (클수록 민감)"
            color="orange"
          />
          <NumberInput
            label="최대 스텝 (mm)"
            value={settings.arc_tracking_step_max_lr}
            onChange={v => updateTouch('arc_tracking_step_max_lr', v)}
            step={0.5}
            min={0.5}
            max={20}
            hint="한 스텝당 최대 보정량"
            color="orange"
          />
          <NumberInput
            label="총 최대 보정량 (mm)"
            value={settings.arc_tracking_sum_max_lr}
            onChange={v => updateTouch('arc_tracking_sum_max_lr', v)}
            step={1}
            min={5}
            max={100}
            hint="누적 최대 보정량"
            color="orange"
          />
          <NumberInput
            label="보정 시작 시점 (주기)"
            value={settings.arc_tracking_t_start_lr}
            onChange={v => updateTouch('arc_tracking_t_start_lr', v)}
            step={1}
            min={0}
            max={100}
            hint="이 주기 수가 지난 뒤부터 보정 시작"
            color="orange"
          />
        </div>
      )}
    </div>
    {}
    <div className="bg-gray-800/50 rounded-xl p-4 space-y-3">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.arc_tracking_up_down}
          onChange={e => updateTouch('arc_tracking_up_down', e.target.checked)}
          className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-orange-500 focus:ring-orange-500 focus:ring-offset-gray-800"
        />
        <span className="text-white font-medium">상하 보정</span>
      </label>
      {settings.arc_tracking_up_down && (
        <div className="pl-8 space-y-3">
          <NumberInput
            label="감도 계수 (Kud)"
            value={settings.arc_tracking_kud}
            onChange={v => updateTouch('arc_tracking_kud', v)}
            step={0.01}
            min={0.01}
            max={1}
            hint="0.01~1.0 (클수록 민감)"
            color="orange"
          />
          <NumberInput
            label="최대 스텝 (mm)"
            value={settings.arc_tracking_step_max_ud}
            onChange={v => updateTouch('arc_tracking_step_max_ud', v)}
            step={0.5}
            min={0.5}
            max={20}
            hint="한 스텝당 최대 보정량"
            color="orange"
          />
          <NumberInput
            label="총 최대 보정량 (mm)"
            value={settings.arc_tracking_sum_max_ud}
            onChange={v => updateTouch('arc_tracking_sum_max_ud', v)}
            step={1}
            min={5}
            max={100}
            hint="누적 최대 보정량"
            color="orange"
          />
          <NumberInput
            label="보정 시작 시점 (주기)"
            value={settings.arc_tracking_t_start_ud}
            onChange={v => updateTouch('arc_tracking_t_start_ud', v)}
            step={1}
            min={0}
            max={100}
            hint="이 주기 수가 지난 뒤부터 보정 시작"
            color="orange"
          />
        </div>
      )}
    </div>
    {/* 공통 파라미터 */}
    <div className="bg-gray-800/50 rounded-xl p-4 space-y-3 md:col-span-2">
      <div className="text-white font-medium">공통</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <NumberInput
          label="보정 시작 지연 (ms)"
          value={settings.arc_tracking_delay_time}
          onChange={v => updateTouch('arc_tracking_delay_time', v)}
          step={10}
          min={0}
          max={5000}
          hint="아크 발생 후 보정 시작까지 대기"
          color="orange"
        />
        <div className="space-y-1">
          <label className="block text-sm text-gray-300">보정 축</label>
          <select
            value={settings.arc_tracking_axis_select}
            onChange={e => updateTouch('arc_tracking_axis_select', Number(e.target.value))}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-orange-500 focus:outline-none"
          >
            <option value={0}>0 — 위빙 좌표</option>
            <option value={1}>1 — 툴 좌표</option>
            <option value={2}>2 — 베이스 좌표</option>
          </select>
          <p className="text-xs text-gray-500">토치 자세 기준이면 툴 좌표</p>
        </div>
        <div className="space-y-1">
          <label className="block text-sm text-gray-300">기준 전류 방식</label>
          <select
            value={settings.arc_tracking_reference_type}
            onChange={e => updateTouch('arc_tracking_reference_type', Number(e.target.value))}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-orange-500 focus:outline-none"
          >
            <option value={0}>0 — 피드백 샘플링</option>
            <option value={1}>1 — 고정값</option>
          </select>
          <p className="text-xs text-gray-500">갭·자세가 매번 다르면 샘플링(0)</p>
        </div>
        <NumberInput
          label="기준 전류 (mA)"
          value={settings.arc_tracking_reference_current}
          onChange={v => updateTouch('arc_tracking_reference_current', v)}
          step={1000}
          min={0}
          max={500000}
          hint="고정값(1)일 때만 사용. 260A = 260000"
          color="orange"
        />
        <NumberInput
          label="샘플링 시작 (주기)"
          value={settings.arc_tracking_refer_sample_start_ud}
          onChange={v => updateTouch('arc_tracking_refer_sample_start_ud', v)}
          step={1}
          min={0}
          max={100}
          hint="기준 전류 측정을 시작할 지점"
          color="orange"
        />
        <NumberInput
          label="샘플링 횟수 (주기)"
          value={settings.arc_tracking_refer_sample_count_ud}
          onChange={v => updateTouch('arc_tracking_refer_sample_count_ud', v)}
          step={1}
          min={1}
          max={100}
          hint="몇 주기를 평균내 기준으로 삼을지"
          color="orange"
        />
      </div>
    </div>
  </div>
);
export const ArcTrackingSection: React.FC<ArcTrackingSectionProps> = ({ settings, updateTouch }) => (
  <div className="mt-8 pt-6 border-t border-gray-700">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
        <Settings className="w-5 h-5 text-orange-400" />
        아크 트래킹 설정
      </h3>
    </div>
    <p className="text-gray-400 text-sm mb-4">용접 중 실시간 용접선 추적 보정 기능을 설정합니다.</p>
    {}
    <div className="flex items-center justify-between bg-gray-800/50 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
          <Settings className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <div className="text-white font-medium">아크 트래킹 사용</div>
          <div className="text-gray-400 text-xs mt-0.5">용접 중 실시간 용접선 추적 보정</div>
        </div>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={settings.arc_tracking_enabled}
          onChange={e => updateTouch('arc_tracking_enabled', e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
      </label>
    </div>
    {settings.arc_tracking_enabled && (
      <ArcTrackingDetails settings={settings} updateTouch={updateTouch} />
    )}
  </div>
);
export const ArcTrackingSection_ArcTrackingSection = ArcTrackingSection;
