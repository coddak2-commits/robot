import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  RotateCcw,
  Zap,
  Clock,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { useAlert } from '../../contexts';
import {
  getWeldingConfig,
  updateWeldingConfig,
  getWeldingPresets,
} from '../../lib';
import {
  WeldingPreset,
  WeldingSequence,
  SafetySettings,
  defaultSequence,
  defaultSafety,
  mapPresetFromApi,
  mapConfigToSequence,
  mapConfigToSafety,
  mapSequenceAndSafetyToConfig,
} from './components';
import { PresetTab_PresetTab as PresetTab } from './components';
import { SequenceTab_SequenceTab as SequenceTab } from './components';
import { SafetyTab_SafetyTab as SafetyTab } from './components';
const Welding: React.FC = () => {
  const navigate = useNavigate();
  const { show: showAlert } = useAlert();
  const [activeTab, setActiveTab] = useState<'presets' | 'sequence' | 'safety'>('sequence');
  const [presets, setPresets] = useState<WeldingPreset[]>([]);
  const [sequence, setSequence] = useState<WeldingSequence>(defaultSequence);
  const [safety, setSafety] = useState<SafetySettings>(defaultSafety);
  const [editingPreset, setEditingPreset] = useState<WeldingPreset | null>(null);
  const [expandedPreset, setExpandedPreset] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const configData = await getWeldingConfig();
      setSequence(mapConfigToSequence(configData));
      setSafety(mapConfigToSafety(configData));
      try {
        const presetsData = await getWeldingPresets();
        setPresets(presetsData.map(mapPresetFromApi));
      } catch {
        setPresets([]);
      }
    } catch (error) {
      console.error('용접 설정 로드 오류:', error);
      showAlert('설정을 불러오는데 실패했습니다.', { type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [showAlert]);
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);
  const handleSaveAll = async () => {
    try {
      setSaving(true);
      await updateWeldingConfig(mapSequenceAndSafetyToConfig(sequence, safety));
      setHasChanges(false);
      showAlert('설정이 저장되었습니다.', { type: 'success' });
    } catch (error) {
      console.error('설정 저장 오류:', error);
      showAlert('설정 저장에 실패했습니다.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };
  const handleReset = async () => {
    if (confirm('모든 설정을 초기값으로 되돌리시겠습니까?')) {
      await loadSettings();
      setHasChanges(false);
    }
  };
  if (loading) {
    return (
      <div className="flex-1 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">설정을 불러오는 중...</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex-1 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 overflow-auto">
      <div className="p-4 md:p-6">
        {}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('presets')}
            className={`px-6 py-3 rounded-xl font-medium transition ${
              activeTab === 'presets'
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <Zap className="w-5 h-5 inline mr-2" />
            용접 프리셋
          </button>
          <button
            onClick={() => setActiveTab('sequence')}
            className={`px-6 py-3 rounded-xl font-medium transition ${
              activeTab === 'sequence'
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <Clock className="w-5 h-5 inline mr-2" />
            시퀀스 설정
          </button>
          <button
            onClick={() => setActiveTab('safety')}
            className={`px-6 py-3 rounded-xl font-medium transition ${
              activeTab === 'safety'
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <AlertTriangle className="w-5 h-5 inline mr-2" />
            안전 설정
          </button>
          <div className="ml-auto flex items-center gap-2">
            {hasChanges && (
              <span className="text-yellow-400 text-sm flex items-center gap-1 mr-2">
                <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                <span className="hidden md:inline">변경됨</span>
              </span>
            )}
            <button
              onClick={handleReset}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 hover:text-white transition flex items-center gap-1 text-sm"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden md:inline">초기화</span>
            </button>
            <button
              onClick={handleSaveAll}
              disabled={!hasChanges || saving}
              className={`px-3 py-2 rounded-lg text-white transition flex items-center gap-1 text-sm ${
                hasChanges && !saving ? 'bg-cyan-600 hover:bg-cyan-500' : 'bg-gray-600 cursor-not-allowed'
              }`}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span className="hidden md:inline">{saving ? '저장 중...' : '저장'}</span>
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 hover:text-white transition flex items-center gap-1 text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden md:inline">돌아가기</span>
            </button>
          </div>
        </div>
        {}
        <div className="mb-6">
          {activeTab === 'presets' && (
            <PresetTab
              presets={presets}
              setPresets={setPresets}
              editingPreset={editingPreset}
              setEditingPreset={setEditingPreset}
              expandedPreset={expandedPreset}
              setExpandedPreset={setExpandedPreset}
            />
          )}
          {activeTab === 'sequence' && (
            <SequenceTab
              sequence={sequence}
              setSequence={setSequence}
              setHasChanges={setHasChanges}
            />
          )}
          {activeTab === 'safety' && (
            <SafetyTab
              safety={safety}
              setSafety={setSafety}
              setHasChanges={setHasChanges}
            />
          )}
        </div>
      </div>
    </div>
  );
};
export default Welding;
