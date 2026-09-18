// 스플라인 이동 설정 (v1.1.156, 시험)
//
// 켜면 용접 구간을 직선(MoveL) 대신 스플라인(NewSpline)으로 지나간다.
// 직선 이동은 끝점 보정값만 적용하지만, 스플라인은 티칭점 3개를 모두 지나가므로
// 각 포인트의 터치 보정값이 경로에 그대로 반영된다.
import React from 'react';
import { Sliders } from 'lucide-react';
import type { TouchSensingSettings } from '..';
import { NumberInput } from './TouchSensingSection';

interface SplineMoveSectionProps {
  settings: TouchSensingSettings;
  updateTouch: (field: keyof TouchSensingSettings, value: boolean | number) => void;
}

const SplineMoveSection: React.FC<SplineMoveSectionProps> = ({ settings, updateTouch }) => (
  <div className="mt-8">
    <div className="flex items-center gap-2 mb-2">
      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
        <Sliders className="w-5 h-5 text-purple-400" />
        스플라인 이동 (시험)
      </h3>
    </div>
    <p className="text-gray-400 text-sm mb-4">
      용접 구간을 직선 대신 스플라인 곡선으로 이동합니다. 꺼져 있으면 기존 직선 이동 그대로입니다.
    </p>
    <div className="flex items-center justify-between bg-gray-800/50 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
          <Sliders className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <div className="text-white font-medium">스플라인 이동 사용</div>
          <div className="text-gray-400 text-xs mt-0.5">티칭점을 모두 지나가며 각 점의 보정값이 적용됩니다</div>
        </div>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={settings.spline_move_enabled}
          onChange={e => updateTouch('spline_move_enabled', e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
      </label>
    </div>
    {settings.spline_move_enabled && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-800/50 rounded-xl p-4 space-y-3">
          <div className="text-white font-medium">연결 방식 (type)</div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              checked={settings.spline_type === 1}
              onChange={() => updateTouch('spline_type', 1)}
              className="w-4 h-4"
            />
            <span className="text-gray-200 text-sm">1 - 티칭점을 경로점으로 사용</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              checked={settings.spline_type === 0}
              onChange={() => updateTouch('spline_type', 0)}
              className="w-4 h-4"
            />
            <span className="text-gray-200 text-sm">0 - 원호 전환</span>
          </label>
          <p className="text-gray-400 text-xs">
            0은 점 사이를 원호로 만들기 때문에 용접선에서 벗어날 수 있습니다.
          </p>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 space-y-3">
          <NumberInput
            label="평균 연결 시간 (ms)"
            value={settings.spline_average_time}
            onChange={v => updateTouch('spline_average_time', v)}
            step={100}
            min={10}
            max={10000}
            hint="점 사이 평균 연결 시간 (SDK 기본 2000)"
            color="orange"
          />
        </div>
      </div>
    )}
  </div>
);

export const SplineMoveSection_SplineMoveSection = SplineMoveSection;
export { SplineMoveSection };
