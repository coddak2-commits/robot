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

interface TouchSensingSectionProps {
  settings: TouchSensingSettings;
  updateTouch: (field: keyof TouchSensingSettings, value: boolean | number) => void;
}
const NumberInput: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  hint: string;
  color: 'yellow' | 'orange';
}> = ({ label, value, onChange, min, max, step, hint, color }) => (
  <div>
    <label className="block text-gray-400 text-sm mb-2 font-medium">{label}</label>
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={e => onChange(parseFloat(e.target.value) || min)}
      className={`w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white focus:border-${color}-500 focus:outline-none`}
    />
    <p className="text-xs text-gray-500 mt-1">{hint}</p>
  </div>
);
const TouchSensingParams: React.FC<TouchSensingSectionProps> = ({ settings, updateTouch }) => (
  <div
    className="grid grid-cols-2 md:grid-cols-3 gap-4"
    data-audit="dup"
    data-audit-note="중복+일부미사용: 터치센싱 — /settings 와 /settings/welding(SequenceTab) 분산. 실행은 SequenceTab의 touch_speed를 읽고 여기 velocity/accel/step/angle/retract/move/search 필드는 사장됨(미참조)"
    data-audit-loc="src/pages/settings/components/TouchSensingSection.tsx:40"
  >
    <NumberInput
      label="탐색 속도 (%)"
      value={settings.touch_sensing_velocity}
      onChange={v => updateTouch('touch_sensing_velocity', v)}
      min={1}
      max={10}
      step={0.5}
      hint="1~10% (낮을수록 정밀)"
      color="yellow"
    />
    <NumberInput
      label="탐색 가속도 (%)"
      value={settings.touch_sensing_acceleration}
      onChange={v => updateTouch('touch_sensing_acceleration', v)}
      min={1}
      max={10}
      step={0.5}
      hint="1~10% (낮을수록 부드러움)"
      color="yellow"
    />
    <NumberInput
      label="탐색 거리 (mm)"
      value={settings.touch_distance}
      onChange={v => updateTouch('touch_distance', v)}
      min={10}
      max={200}
      step={5}
      hint="10~200mm"
      color="yellow"
    />
    <NumberInput
      label="스텝 크기 (mm)"
      value={settings.touch_sensing_step_size}
      onChange={v => updateTouch('touch_sensing_step_size', v)}
      min={1}
      max={20}
      step={1}
      hint="1~20mm (점진적 이동 단위)"
      color="yellow"
    />
    <NumberInput
      label="접근 각도 (도)"
      value={settings.touch_approach_angle}
      onChange={v => updateTouch('touch_approach_angle', v)}
      min={0}
      max={45}
      step={5}
      hint="0~45도 (좌우 센싱 시 헤드 틸트)"
      color="yellow"
    />
    <NumberInput
      label="센싱 후 이격 거리 (mm)"
      value={settings.touch_sensing_retract_distance}
      onChange={v => updateTouch('touch_sensing_retract_distance', v)}
      min={5}
      max={50}
      step={1}
      hint="5~50mm (접촉 후 후퇴 및 다음 포인트 이동 전 이격)"
      color="yellow"
    />
    <NumberInput
      label="포인트별 이격거리 (mm)"
      value={settings.touch_sensing_approach_offset}
      onChange={v => updateTouch('touch_sensing_approach_offset', v)}
      min={50}
      max={200}
      step={10}
      hint="50~200mm (포인트 접근/이탈 시 TCP Z축 후퇴 거리)"
      color="yellow"
    />
    <NumberInput
      label="터치 센싱 이동 거리 (mm)"
      value={settings.touch_sensing_move_distance}
      onChange={v => updateTouch('touch_sensing_move_distance', v)}
      min={0.1}
      max={1.0}
      step={0.1}
      hint="0.1~1.0mm (와이어 접촉 감지 트리거 거리, 작을수록 안전)"
      color="yellow"
    />
    <NumberInput
      label="포인트 이동 속도 (%)"
      value={settings.touch_sensing_point_speed}
      onChange={v => updateTouch('touch_sensing_point_speed', v)}
      min={10}
      max={100}
      step={5}
      hint="10~100% (터치 센싱 중 포인트 간 이동 속도)"
      color="yellow"
    />
    <NumberInput
      label="와이어 탐색 속도 (%)"
      value={settings.touch_sensing_search_speed}
      onChange={v => updateTouch('touch_sensing_search_speed', v)}
      min={1}
      max={10}
      step={1}
      hint="1~10% (와이어가 모재에 접촉할 때까지 이동하는 속도)"
      color="yellow"
    />
  </div>
);
const TouchSensingDirections: React.FC<TouchSensingSectionProps> = ({ settings, updateTouch }) => {
  const checkbox = (field: keyof TouchSensingSettings, label: string) => (
    <label className="flex items-center gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={settings[field] as boolean}
        onChange={e => updateTouch(field, e.target.checked)}
        className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-yellow-500 focus:ring-yellow-500 focus:ring-offset-gray-800"
      />
      <span className="text-white">{label}</span>
    </label>
  );
  const pointCard = (
    title: string,
    color: string,
    fields: [keyof TouchSensingSettings, string][],
  ) => (
    <div className="bg-gray-800/50 rounded-xl p-4">
      <div className={`text-${color} font-medium mb-3`}>{title}</div>
      <div className="space-y-2">
        {fields.map(([field, label]) => (
          <React.Fragment key={field}>{checkbox(field, label)}</React.Fragment>
        ))}
      </div>
    </div>
  );
  return (
    <div className="mt-6 pt-4 border-t border-gray-700">
      <h4 className="text-md font-medium text-white mb-3">포인트별 터치 센싱 방향</h4>
      <p className="text-gray-400 text-xs mb-4">
        각 포인트에서 수행할 터치 센싱 방향을 선택합니다. 세로/가로 용접에 따라 터치 방향이
        다릅니다.
      </p>
      {}
      <div className="mb-6">
        <h5 className="text-sm font-medium text-purple-400 mb-3 flex items-center gap-2">
          <span className="w-3 h-3 bg-purple-500 rounded-full"></span>
          Part1: 가로 용접 (P4→P5→P6)
        </h5>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pointCard('P4 (시작점)', 'cyan-400', [
            ['p4_touch_center', '중앙 (X방향)'],
            ['p4_touch_top', '상단 (+Z방향)'],
            ['p4_touch_bottom', '하단 (-Z방향)'],
            ['p4_touch_side', '좌측 (-Y방향)'],
          ])}
          {pointCard('P5 (중간점)', 'green-400', [
            ['p5_touch_center', '중앙 (X방향)'],
            ['p5_touch_top', '상단 (+Z방향)'],
            ['p5_touch_bottom', '하단 (-Z방향)'],
          ])}
          {pointCard('P6 (끝점)', 'orange-400', [
            ['p6_touch_center', '중앙 (X방향)'],
            ['p6_touch_top', '상단 (+Z방향)'],
            ['p6_touch_bottom', '하단 (-Z방향)'],
          ])}
        </div>
      </div>
      {}
      <div className="mb-6">
        <h5 className="text-sm font-medium text-blue-400 mb-3 flex items-center gap-2">
          <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
          Part2: 세로 용접 (P3→P2→P1)
        </h5>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pointCard('P3 (시작점)', 'cyan-400', [
            ['p3_touch_center', '중앙 (X방향)'],
            ['p3_touch_left', '좌측 (-Y방향)'],
            ['p3_touch_right', '우측 (+Y방향)'],
            ['p3_touch_bottom', '하단 (-Z방향)'],
          ])}
          {pointCard('P2 (중간점)', 'green-400', [
            ['p2_touch_center', '중앙 (X방향)'],
            ['p2_touch_left', '좌측 (-Y방향)'],
            ['p2_touch_right', '우측 (+Y방향)'],
          ])}
          {pointCard('P1 (끝점)', 'orange-400', [
            ['p1_touch_center', '중앙 (X방향)'],
            ['p1_touch_left', '좌측 (-Y방향)'],
            ['p1_touch_right', '우측 (+Y방향)'],
          ])}
        </div>
      </div>
      {}
      <div className="mb-6">
        <h5 className="text-sm font-medium text-pink-400 mb-3 flex items-center gap-2">
          <span className="w-3 h-3 bg-pink-500 rounded-full"></span>
          Part3: 가로 용접 (P10→P11→P12)
        </h5>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pointCard('P10 (시작점)', 'cyan-400', [
            ['p10_touch_center', '중앙 (X방향)'],
            ['p10_touch_top', '상단 (+Z방향)'],
            ['p10_touch_bottom', '하단 (-Z방향)'],
            ['p10_touch_side', '우측 (+Y방향)'],
          ])}
          {pointCard('P11 (중간점)', 'green-400', [
            ['p11_touch_center', '중앙 (X방향)'],
            ['p11_touch_top', '상단 (+Z방향)'],
            ['p11_touch_bottom', '하단 (-Z방향)'],
          ])}
          {pointCard('P12 (끝점)', 'orange-400', [
            ['p12_touch_center', '중앙 (X방향)'],
            ['p12_touch_top', '상단 (+Z방향)'],
            ['p12_touch_bottom', '하단 (-Z방향)'],
          ])}
        </div>
      </div>
      {}
      <div className="mb-6">
        <h5 className="text-sm font-medium text-amber-400 mb-3 flex items-center gap-2">
          <span className="w-3 h-3 bg-amber-500 rounded-full"></span>
          Part4: 세로 용접 (P9→P8→P7)
        </h5>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pointCard('P9 (시작점)', 'cyan-400', [
            ['p9_touch_center', '중앙 (X방향)'],
            ['p9_touch_left', '좌측 (-Y방향)'],
            ['p9_touch_right', '우측 (+Y방향)'],
            ['p9_touch_bottom', '하단 (-Z방향)'],
          ])}
          {pointCard('P8 (중간점)', 'green-400', [
            ['p8_touch_center', '중앙 (X방향)'],
            ['p8_touch_left', '좌측 (-Y방향)'],
            ['p8_touch_right', '우측 (+Y방향)'],
          ])}
          {pointCard('P7 (끝점)', 'orange-400', [
            ['p7_touch_center', '중앙 (X방향)'],
            ['p7_touch_left', '좌측 (-Y방향)'],
            ['p7_touch_right', '우측 (+Y방향)'],
          ])}
        </div>
      </div>
    </div>
  );
};
export const TouchSensingSection: React.FC<TouchSensingSectionProps> = ({ settings, updateTouch }) => (
  <div className="mt-8 pt-6 border-t border-gray-700">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
        <Settings className="w-5 h-5 text-yellow-400" />
        터치 센싱 설정
      </h3>
    </div>
    <p className="text-gray-400 text-sm mb-4">
      터치 센싱 시 사용되는 속도, 거리, 각도 등을 설정합니다.
    </p>
    {}
    <div className="flex items-center justify-between bg-gray-800/50 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center">
          <Settings className="w-5 h-5 text-yellow-400" />
        </div>
        <div>
          <div className="text-white font-medium">터치 센싱 사용</div>
          <div className="text-gray-400 text-xs mt-0.5">용접 시작 전 모재 표면 탐색 활성화</div>
        </div>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={settings.touch_sensing_enabled}
          onChange={e => updateTouch('touch_sensing_enabled', e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-500"></div>
      </label>
    </div>
    <TouchSensingParams settings={settings} updateTouch={updateTouch} />
    <TouchSensingDirections settings={settings} updateTouch={updateTouch} />
  </div>
);
export { NumberInput };
export const TouchSensingSection_TouchSensingSection = TouchSensingSection;
