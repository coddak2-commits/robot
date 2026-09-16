import React, { useState, useEffect, useCallback } from 'react';
import { ChevronUp, ChevronDown, Save, RotateCcw, GripVertical, Zap, Thermometer, Gauge, Wind, Trash2, Copy, Edit2, Check, X, Plus, AlertTriangle, Crosshair, Radio, Info } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getWeldingPartOrder, updateWeldingPartOrder, WeldingConfigData } from '../../../lib';
import type { WeldingPartOrderItem } from '../../../lib';
import { useAlert } from '../../../contexts';
function SortablePartItem({
  item,
  idx,
  total,
  onMoveUp,
  onMoveDown,
}: {
  item: WeldingPartOrderItem;
  idx: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(item.part_index),
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex items-center gap-2 p-2 bg-gray-800/50 border border-gray-700/50 rounded-lg cursor-grab active:cursor-grabbing"
    >
      <div className="p-0.5 text-gray-500">
        <GripVertical className="w-4 h-4" />
      </div>
      <span className="w-6 h-6 flex items-center justify-center bg-cyan-500/20 text-cyan-400 text-xs font-bold rounded">
        {idx + 1}
      </span>
      <div className="flex-1">
        <span className="text-sm text-white">{item.part_name}</span>
        <span className="text-xs text-gray-400 ml-2">
          ({item.points.map(p => p.toUpperCase()).join(' → ')})
        </span>
      </div>
      <div className="flex gap-1">
        <button
          onClick={onMoveUp}
          disabled={idx === 0}
          className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded disabled:opacity-30"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={idx === total - 1}
          className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded disabled:opacity-30"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
export function PartOrderSection() {
  const [order, setOrder] = useState<WeldingPartOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const fetchOrder = useCallback(async () => {
    setLoading(true);
    const data = await getWeldingPartOrder();
    if (data.length > 0) {
      setOrder(data);
    } else {
      setOrder([
        {
          part_index: 0,
          execution_order: 0,
          part_name: '파트1 (하단 좌측)',
          points: ['p4', 'p5', 'p6'],
        },
        {
          part_index: 1,
          execution_order: 1,
          part_name: '파트2 (좌측)',
          points: ['p3', 'p2', 'p1'],
        },
        {
          part_index: 2,
          execution_order: 2,
          part_name: '파트3 (하단 우측)',
          points: ['p10', 'p11', 'p12'],
        },
        {
          part_index: 3,
          execution_order: 3,
          part_name: '파트4 (우측)',
          points: ['p9', 'p8', 'p7'],
        },
      ]);
    }
    setLoading(false);
    setHasChanges(false);
  }, []);
  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);
  const reorder = (newOrder: WeldingPartOrderItem[]) => {
    newOrder.forEach((item, i) => (item.execution_order = i));
    setOrder(newOrder);
    setHasChanges(true);
  };
  const moveUp = (idx: number) => {
    if (idx <= 0) return;
    const arr = [...order];
    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    reorder(arr);
  };
  const moveDown = (idx: number) => {
    if (idx >= order.length - 1) return;
    const arr = [...order];
    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    reorder(arr);
  };
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = order.findIndex(o => String(o.part_index) === active.id);
    const newIdx = order.findIndex(o => String(o.part_index) === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const arr = [...order];
    const [moved] = arr.splice(oldIdx, 1);
    arr.splice(newIdx, 0, moved);
    reorder(arr);
  };
  const handleSave = async () => {
    setSaving(true);
    const ok = await updateWeldingPartOrder(order);
    setSaving(false);
    setHasChanges(!ok);
  };
  if (loading) return <div className="text-gray-400 text-sm p-4">로딩 중...</div>;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-white">용접 파트 실행 순서</h4>
        <div className="flex gap-2">
          <button
            onClick={fetchOrder}
            className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 text-white rounded flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> 초기화
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:opacity-50 text-white rounded flex items-center gap-1"
          >
            <Save className="w-3 h-3" /> {saving ? '저장 중...' : '순서 저장'}
          </button>
        </div>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={order.map(o => String(o.part_index))}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1">
            {order.map((item, idx) => (
              <SortablePartItem
                key={item.part_index}
                item={item}
                idx={idx}
                total={order.length}
                onMoveUp={() => moveUp(idx)}
                onMoveDown={() => moveDown(idx)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {hasChanges && (
        <p className="text-xs text-yellow-400">
          * 순서가 변경되었습니다. &ldquo;순서 저장&rdquo;을 눌러 적용하세요.
        </p>
      )}
    </div>
  );
}
interface SafetyTabProps {
  safety: SafetySettings;
  setSafety: React.Dispatch<React.SetStateAction<SafetySettings>>;
  setHasChanges: React.Dispatch<React.SetStateAction<boolean>>;
}
const SafetyTab: React.FC<SafetyTabProps> = ({ safety, setSafety, setHasChanges }) => {
  const update = (patch: Partial<SafetySettings>) => {
    setSafety(prev => ({ ...prev, ...patch }));
    setHasChanges(true);
  };
  return (
    <div className="space-y-4">
      {}
      <div
        className="bg-gray-800/60 rounded-2xl border border-gray-700/50 p-4"
        data-audit="unused"
        data-audit-note="미사용: 출력제한(최대전류/전압/아크시간)은 저장되나 용접 실행이 안 읽음 — 실제 전류/전압은 포인트 티칭값 사용"
        data-audit-loc="src/pages/setting/components/SafetyTab.tsx:30"
      >
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-400" />
          출력 제한 설정
        </h3>
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">최대 전류</label>
            <input
              type="number"
              value={safety.maxCurrent}
              onChange={e => update({ maxCurrent: Number(e.target.value) })}
              min="100"
              max="500"
              className="w-20 bg-gray-700 text-white px-2 py-1 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none text-sm"
            />
            <span className="text-xs text-gray-500">A</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">최대 전압</label>
            <input
              type="number"
              value={safety.maxVoltage}
              onChange={e => update({ maxVoltage: Number(e.target.value) })}
              min="10"
              max="50"
              className="w-20 bg-gray-700 text-white px-2 py-1 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none text-sm"
            />
            <span className="text-xs text-gray-500">V</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">아크 제한</label>
            <input
              type="number"
              value={safety.arcTimeLimit}
              onChange={e => update({ arcTimeLimit: Number(e.target.value) })}
              min="60"
              max="600"
              className="w-20 bg-gray-700 text-white px-2 py-1 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none text-sm"
            />
            <span className="text-xs text-gray-500">초</span>
          </div>
        </div>
      </div>
      {}
      <div
        className="bg-gray-800/60 rounded-2xl border border-gray-700/50 p-4"
        data-audit="unused"
        data-audit-note="미사용: 과열보호(임계온도)는 저장되나 용접 실행이 참조 안 함"
        data-audit-loc="src/pages/setting/components/SafetyTab.tsx:78"
      >
        <div className="flex flex-wrap gap-4 items-center">
          <label className="flex items-center gap-2 cursor-pointer">
            <Thermometer className="w-4 h-4 text-red-400" />
            <input
              type="checkbox"
              checked={safety.overHeatProtection}
              onChange={e => update({ overHeatProtection: e.target.checked })}
              className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500"
            />
            <span className="text-sm text-white">과열 보호</span>
          </label>
          {safety.overHeatProtection && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-400">임계 온도</label>
              <input
                type="number"
                value={safety.overHeatThreshold}
                onChange={e => update({ overHeatThreshold: Number(e.target.value) })}
                min="50"
                max="120"
                className="w-20 bg-gray-700 text-white px-2 py-1 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none text-sm"
              />
              <span className="text-xs text-gray-500">°C</span>
            </div>
          )}
        </div>
      </div>
      {}
      <div className="bg-gray-800/60 rounded-2xl border border-gray-700/50 p-4">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Wind className="w-4 h-4 text-blue-400" />
          보호가스 설정
        </h3>
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">선행 가스</label>
            <input
              type="number"
              value={safety.gasPreFlowTime}
              onChange={e => update({ gasPreFlowTime: Number(e.target.value) })}
              min="0"
              max="2000"
              step="100"
              className="w-24 bg-gray-700 text-white px-2 py-1 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none text-sm"
            />
            <span className="text-xs text-gray-500">ms</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">후행 가스</label>
            <input
              type="number"
              value={safety.gasPostFlowTime}
              onChange={e => update({ gasPostFlowTime: Number(e.target.value) })}
              min="500"
              max="5000"
              step="100"
              className="w-24 bg-gray-700 text-white px-2 py-1 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none text-sm"
            />
            <span className="text-xs text-gray-500">ms</span>
          </div>
        </div>
      </div>
    </div>
  );
};
export const SafetyTab_SafetyTab = SafetyTab;
interface SequenceTabProps {
  sequence: WeldingSequence;
  setSequence: React.Dispatch<React.SetStateAction<WeldingSequence>>;
  setHasChanges: React.Dispatch<React.SetStateAction<boolean>>;
}
const SequenceTab: React.FC<SequenceTabProps> = ({ sequence, setSequence, setHasChanges }) => {
  const update = (patch: Partial<WeldingSequence>) => {
    setSequence(prev => ({ ...prev, ...patch }));
    setHasChanges(true);
  };
  return (
    <div className="space-y-6">
      {}
      <div
        className="bg-gray-800/60 rounded-2xl border border-gray-700/50 p-6"
        data-audit="dup"
        data-audit-note="중복: 터치센싱 설정 — /settings/welding 와 /settings(TouchSensingSection). 필드명 불일치(touchSpeed vs touch_sensing_velocity) 주의"
        data-audit-loc="src/pages/setting/components/SequenceTab.tsx:32"
      >
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Crosshair className="w-5 h-5 text-cyan-400" />
          터치 센싱 설정
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <label className="flex items-center gap-3 cursor-pointer md:col-span-2">
            <input
              type="checkbox"
              checked={sequence.touchSensingEnabled}
              onChange={e => update({ touchSensingEnabled: e.target.checked })}
              className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500"
            />
            <div>
              <span className="text-white">터치 센싱 사용</span>
              <p className="text-xs text-gray-400">
                용접 시작 전 와이어 터치로 위치 보정 (포인트별 개별 터치)
              </p>
            </div>
          </label>
          {sequence.touchSensingEnabled && (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-2">탐색 속도 (%)</label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    value={sequence.touchSpeed}
                    onChange={e => update({ touchSpeed: Number(e.target.value) })}
                    min="1"
                    max="30"
                    className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                  />
                  <span className="text-white font-mono w-12 text-right">
                    {sequence.touchSpeed}%
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">탐색 거리 (mm)</label>
                <input
                  type="number"
                  value={sequence.touchDistance}
                  onChange={e => update({ touchDistance: Number(e.target.value) })}
                  min="10"
                  max="200"
                  className="w-full bg-gray-700 text-white px-4 py-3 rounded-xl border border-gray-600 focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">오프셋 깊이 (mm)</label>
                <input
                  type="number"
                  value={sequence.touchOffsetDepth}
                  onChange={e => update({ touchOffsetDepth: Number(e.target.value) })}
                  min="1"
                  max="20"
                  className="w-full bg-gray-700 text-white px-4 py-3 rounded-xl border border-gray-600 focus:border-cyan-500 focus:outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">터치 후 용접 깊이 보정값</p>
              </div>
            </>
          )}
        </div>
      </div>
      {}
      <div
        className="bg-gray-800/60 rounded-2xl border border-gray-700/50 p-6"
        data-audit="dup"
        data-audit-note="중복: 아크 트래킹 설정 — /settings/welding 와 /settings(ArcTrackingSection)가 동일 welding_config 편집"
        data-audit-loc="src/pages/setting/components/SequenceTab.tsx:95"
      >
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Radio className="w-5 h-5 text-orange-400" />
          아크 트래킹 설정
        </h3>
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={sequence.arcTrackingEnabled}
              onChange={e => update({ arcTrackingEnabled: e.target.checked })}
              className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-orange-500 focus:ring-orange-500"
            />
            <div>
              <span className="text-white">아크 트래킹 사용</span>
              <p className="text-xs text-gray-400">용접 중 실시간 용접선 추적 보정</p>
            </div>
          </label>
          {sequence.arcTrackingEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-700">
              {}
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sequence.arcTrackingLeftRight}
                    onChange={e => update({ arcTrackingLeftRight: e.target.checked })}
                    className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500"
                  />
                  <span className="text-white text-sm">좌우 보정</span>
                </label>
                {sequence.arcTrackingLeftRight && (
                  <div className="pl-7 space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">감도 계수 (Klr)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={sequence.arcTrackingKlr}
                        onChange={e => update({ arcTrackingKlr: Number(e.target.value) })}
                        min="0.01"
                        max="1"
                        className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">최대 스텝 (mm)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={sequence.arcTrackingStepMaxLr}
                        onChange={e => update({ arcTrackingStepMaxLr: Number(e.target.value) })}
                        min="0.5"
                        max="20"
                        className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        총 최대 보정량 (mm)
                      </label>
                      <input
                        type="number"
                        step="1"
                        value={sequence.arcTrackingSumMaxLr}
                        onChange={e => update({ arcTrackingSumMaxLr: Number(e.target.value) })}
                        min="5"
                        max="100"
                        className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
              {}
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sequence.arcTrackingUpDown}
                    onChange={e => update({ arcTrackingUpDown: e.target.checked })}
                    className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500"
                  />
                  <span className="text-white text-sm">상하 보정</span>
                </label>
                {sequence.arcTrackingUpDown && (
                  <div className="pl-7 space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">감도 계수 (Kud)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={sequence.arcTrackingKud}
                        onChange={e => update({ arcTrackingKud: Number(e.target.value) })}
                        min="0.01"
                        max="1"
                        className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">최대 스텝 (mm)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={sequence.arcTrackingStepMaxUd}
                        onChange={e => update({ arcTrackingStepMaxUd: Number(e.target.value) })}
                        min="0.5"
                        max="20"
                        className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        총 최대 보정량 (mm)
                      </label>
                      <input
                        type="number"
                        step="1"
                        value={sequence.arcTrackingSumMaxUd}
                        onChange={e => update({ arcTrackingSumMaxUd: Number(e.target.value) })}
                        min="5"
                        max="100"
                        className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {}
      <div
        className="bg-gray-800/60 rounded-2xl border border-gray-700/50 p-6"
        data-audit="unused"
        data-audit-note="미사용: 아크스타트(재시도횟수/간격/와이어돌출)는 저장되나 용접 실행이 참조 안 함"
        data-audit-loc="src/pages/setting/components/SequenceTab.tsx:238"
      >
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Info className="w-5 h-5 text-cyan-400" />
          아크 스타트 설정
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm text-gray-400 mb-2">아크 재시도 횟수</label>
            <input
              type="number"
              value={sequence.arcRetryCount}
              onChange={e => update({ arcRetryCount: Number(e.target.value) })}
              min="0"
              max="10"
              className="w-full bg-gray-700 text-white px-4 py-3 rounded-xl border border-gray-600 focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">재시도 간격 (ms)</label>
            <input
              type="number"
              value={sequence.arcRetryDelay}
              onChange={e => update({ arcRetryDelay: Number(e.target.value) })}
              min="100"
              max="2000"
              step="100"
              className="w-full bg-gray-700 text-white px-4 py-3 rounded-xl border border-gray-600 focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">와이어 돌출 길이 (mm)</label>
            <input
              type="number"
              value={sequence.stickoutLength}
              onChange={e => update({ stickoutLength: Number(e.target.value) })}
              min="5"
              max="30"
              className="w-full bg-gray-700 text-white px-4 py-3 rounded-xl border border-gray-600 focus:border-cyan-500 focus:outline-none"
            />
          </div>
        </div>
      </div>
      {}
      <div
        className="bg-gray-800/60 rounded-2xl border border-gray-700/50 p-6"
        data-audit="unused"
        data-audit-note="미사용: 토치각도(진행각/작업각)는 저장되나 용접 실행이 참조 안 함 — 실제 토치자세는 포인트 티칭 rx/ry/rz 사용"
        data-audit-loc="src/pages/setting/components/SequenceTab.tsx:282"
      >
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Gauge className="w-5 h-5 text-cyan-400" />
          토치 각도 설정
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-gray-400 mb-2">진행각 (Travel Angle) °</label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                value={sequence.travelAngle}
                onChange={e => update({ travelAngle: Number(e.target.value) })}
                min="0"
                max="45"
                className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <span className="text-white font-mono w-12 text-right">{sequence.travelAngle}°</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">용접 진행 방향에 대한 토치 기울기</p>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">작업각 (Work Angle) °</label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                value={sequence.workAngle}
                onChange={e => update({ workAngle: Number(e.target.value) })}
                min="0"
                max="90"
                className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <span className="text-white font-mono w-12 text-right">{sequence.workAngle}°</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">모재에 대한 토치 수직 기울기</p>
          </div>
        </div>
      </div>
      {}
      <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700/30">
        <PartOrderSection />
      </div>
    </div>
  );
};
export const SequenceTab_SequenceTab = SequenceTab;
export interface WeldingSequence {
  touchSensingEnabled: boolean;
  touchSpeed: number;
  touchDistance: number;
  touchOffsetDepth: number;
  arcRetryCount: number;
  arcRetryDelay: number;
  stickoutLength: number;
  travelAngle: number;
  workAngle: number;
  arcTrackingEnabled: boolean;
  arcTrackingLeftRight: boolean;
  arcTrackingUpDown: boolean;
  arcTrackingKlr: number;
  arcTrackingKud: number;
  arcTrackingStepMaxLr: number;
  arcTrackingStepMaxUd: number;
  arcTrackingSumMaxLr: number;
  arcTrackingSumMaxUd: number;
}
export interface SafetySettings {
  maxCurrent: number;
  maxVoltage: number;
  overHeatProtection: boolean;
  overHeatThreshold: number;
  arcTimeLimit: number;
  gasPreFlowTime: number;
  gasPostFlowTime: number;
}
export const mapConfigToSequence = (config: WeldingConfigData): WeldingSequence => ({
  touchSensingEnabled: config.touch_sensing_enabled,
  touchSpeed: config.touch_speed,
  touchDistance: config.touch_distance,
  touchOffsetDepth: config.touch_offset_depth,
  arcRetryCount: config.arc_retry_count,
  arcRetryDelay: config.arc_retry_delay,
  stickoutLength: config.stickout_length,
  travelAngle: config.travel_angle,
  workAngle: config.work_angle,
  arcTrackingEnabled: config.arc_tracking_enabled,
  arcTrackingLeftRight: config.arc_tracking_left_right,
  arcTrackingUpDown: config.arc_tracking_up_down,
  arcTrackingKlr: config.arc_tracking_klr,
  arcTrackingKud: config.arc_tracking_kud,
  arcTrackingStepMaxLr: config.arc_tracking_step_max_lr,
  arcTrackingStepMaxUd: config.arc_tracking_step_max_ud,
  arcTrackingSumMaxLr: config.arc_tracking_sum_max_lr,
  arcTrackingSumMaxUd: config.arc_tracking_sum_max_ud,
});
export const mapConfigToSafety = (config: WeldingConfigData): SafetySettings => ({
  maxCurrent: config.max_current,
  maxVoltage: config.max_voltage,
  overHeatProtection: config.overheat_protection,
  overHeatThreshold: config.overheat_threshold,
  arcTimeLimit: config.arc_time_limit,
  gasPreFlowTime: config.gas_pre_flow_time,
  gasPostFlowTime: config.gas_post_flow_time,
});
export const mapSequenceAndSafetyToConfig = (
  seq: WeldingSequence,
  safety: SafetySettings,
): Partial<WeldingConfigData> => ({
  touch_sensing_enabled: seq.touchSensingEnabled,
  touch_speed: seq.touchSpeed,
  touch_distance: seq.touchDistance,
  touch_offset_depth: seq.touchOffsetDepth,
  arc_retry_count: seq.arcRetryCount,
  arc_retry_delay: seq.arcRetryDelay,
  stickout_length: seq.stickoutLength,
  travel_angle: seq.travelAngle,
  work_angle: seq.workAngle,
  arc_tracking_enabled: seq.arcTrackingEnabled,
  arc_tracking_left_right: seq.arcTrackingLeftRight,
  arc_tracking_up_down: seq.arcTrackingUpDown,
  arc_tracking_klr: seq.arcTrackingKlr,
  arc_tracking_kud: seq.arcTrackingKud,
  arc_tracking_step_max_lr: seq.arcTrackingStepMaxLr,
  arc_tracking_step_max_ud: seq.arcTrackingStepMaxUd,
  arc_tracking_sum_max_lr: seq.arcTrackingSumMaxLr,
  arc_tracking_sum_max_ud: seq.arcTrackingSumMaxUd,
  max_current: safety.maxCurrent,
  max_voltage: safety.maxVoltage,
  overheat_protection: safety.overHeatProtection,
  overheat_threshold: safety.overHeatThreshold,
  arc_time_limit: safety.arcTimeLimit,
  gas_pre_flow_time: safety.gasPreFlowTime,
  gas_post_flow_time: safety.gasPostFlowTime,
});
export const defaultSequence: WeldingSequence = {
  touchSensingEnabled: true,
  touchSpeed: 10,
  touchDistance: 100,
  touchOffsetDepth: 5,
  arcRetryCount: 3,
  arcRetryDelay: 500,
  stickoutLength: 15,
  travelAngle: 15,
  workAngle: 45,
  arcTrackingEnabled: false,
  arcTrackingLeftRight: true,
  arcTrackingUpDown: true,
  arcTrackingKlr: 0.06,
  arcTrackingKud: 0.06,
  arcTrackingStepMaxLr: 5.0,
  arcTrackingStepMaxUd: 5.0,
  arcTrackingSumMaxLr: 30.0,
  arcTrackingSumMaxUd: 30.0,
};
export const defaultSafety: SafetySettings = {
  maxCurrent: 400,
  maxVoltage: 40,
  overHeatProtection: true,
  overHeatThreshold: 80,
  arcTimeLimit: 300,
  gasPreFlowTime: 500,
  gasPostFlowTime: 2000,
};
