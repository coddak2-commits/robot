import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/common/index';
import {
  moveRobot,
  getRobotPoints,
  RobotPointData,
  getRealtimeRobotStatus,
  moveToJointPosition,
  getRobotSettings,
  updateRobotSettings,
  RobotSettingsData,
} from '../../lib';
import { useAlert } from '../../contexts';
import { CoordinateSettings, RobotPointTable } from './components/index';
import { TableRow } from './components';
const RobotSettings: React.FC = () => {
  const navigate = useNavigate();
  const { show: showAlert } = useAlert();
  const [tableData, setTableData] = useState<TableRow[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [isMoving, setIsMoving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRealTimeUpdating, setIsRealTimeUpdating] = useState(true);
  const [isCreatingNewRow, setIsCreatingNewRow] = useState(false);
  const [isLoadingPoints, setIsLoadingPoints] = useState(true);
  const intervalRef = useRef<number | null>(null);
  const [robotSettings, setRobotSettingsState] = useState<RobotSettingsData>({
    tool_num: 0,
    user_num: 0,
    default_vel: 20,
    default_acc: 100,
    default_ovl: 100,
    auto_clear_error: true,
    min_weaving_distance: 50,
  });
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);
  const convertApiDataToTableRow = (pointId: string, pointData: RobotPointData): TableRow => {
    return {
      id: pointId,
      name: pointData.name,
      x: pointData.x,
      y: pointData.y,
      z: pointData.z,
      rx: pointData.rx,
      ry: pointData.ry,
      rz: pointData.rz,
      j1: pointData.j1,
      j2: pointData.j2,
      j3: pointData.j3,
      j4: pointData.j4,
      j5: pointData.j5,
      j6: pointData.j6,
      isRealTime: false,
    };
  };
  const loadRobotPoints = async () => {
    setIsLoadingPoints(true);
    try {
      const response = await getRobotPoints();
      if (response.status_code === 200) {
        const convertedData = Object.keys(response.data)
          .map((pointId: string) => {
            const pointData = response.data[pointId];
            return pointData ? convertApiDataToTableRow(pointId, pointData) : null;
          })
          .filter((item): item is TableRow => item !== null);
        setTableData(convertedData);
      } else {
        console.error('포인트 데이터 로드 실패:', response);
        showAlert('포인트 데이터를 가져오는데 실패했습니다.', { type: 'error' });
      }
    } catch (error) {
      console.error('포인트 데이터 로드 오류:', error);
      showAlert('포인트 데이터를 가져오는데 실패했습니다. 서버 연결을 확인해주세요.', { type: 'error' });
    } finally {
      setIsLoadingPoints(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadRobotPoints();
  }, []);
  const loadRobotSettingsData = async () => {
    try {
      const settings = await getRobotSettings();
      setRobotSettingsState(settings);
    } catch (error) {
      console.error('로봇 설정 로드 오류:', error);
    }
  };
  const saveRobotSettings = async () => {
    setIsSettingsLoading(true);
    try {
      const updated = await updateRobotSettings(robotSettings);
      setRobotSettingsState(updated);
      showAlert('로봇 설정이 저장되었습니다.', { type: 'success' });
    } catch (error) {
      console.error('로봇 설정 저장 오류:', error);
      showAlert('로봇 설정 저장에 실패했습니다.', { type: 'error' });
    } finally {
      setIsSettingsLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadRobotSettingsData();
  }, []);
  const updateRobotStatus = async () => {
    if (!isRealTimeUpdating || isCreatingNewRow || isMoving) return;
    try {
      const status = await getRealtimeRobotStatus();
      if (!status.connected || !status.tcp || !status.joints) return;
      const tcp = status.tcp;
      const joints = status.joints;
      setTableData(prev =>
        prev.map(row => {
          if (!row.isRealTime) return row;
          const activeElement = document.activeElement;
          const isEditing =
            activeElement &&
            (activeElement.closest(`tr[data-row-id="${row.id}"]`) ||
              (activeElement.tagName === 'INPUT' &&
                activeElement.closest(`tr[data-row-id="${row.id}"]`)));
          if (isEditing) return row;
          return {
            ...row,
            x: tcp[0]?.toFixed(3) || '0',
            y: tcp[1]?.toFixed(3) || '0',
            z: tcp[2]?.toFixed(3) || '0',
            rx: tcp[3]?.toFixed(3) || '0',
            ry: tcp[4]?.toFixed(3) || '0',
            rz: tcp[5]?.toFixed(3) || '0',
            j1: joints[0]?.toFixed(3) || '0',
            j2: joints[1]?.toFixed(3) || '0',
            j3: joints[2]?.toFixed(3) || '0',
            j4: joints[3]?.toFixed(3) || '0',
            j5: joints[4]?.toFixed(3) || '0',
            j6: joints[5]?.toFixed(3) || '0',
          };
        }),
      );
    } catch (error) {
      console.error('실시간 상태 업데이트 실패:', error);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isRealTimeUpdating && !isCreatingNewRow && !isMoving) {
      intervalRef.current = setInterval(updateRobotStatus, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRealTimeUpdating, isCreatingNewRow, isMoving]);
  const handleAddNewPoint = async () => {
    setIsLoading(true);
    setIsCreatingNewRow(true);
    try {
      const status = await getRealtimeRobotStatus();
      if (!status.connected || !status.tcp || !status.joints) {
        throw new Error('로봇 연결 안됨');
      }
      const tcp = status.tcp;
      const joints = status.joints;
      setTableData(prev =>
        prev.map(row => ({ ...row, isRealTime: false })),
      );
      const newRow: TableRow = {
        id: Date.now().toString(),
        name: `Point ${tableData.length + 1}`,
        x: tcp[0]?.toFixed(3) || '0',
        y: tcp[1]?.toFixed(3) || '0',
        z: tcp[2]?.toFixed(3) || '0',
        rx: tcp[3]?.toFixed(3) || '0',
        ry: tcp[4]?.toFixed(3) || '0',
        rz: tcp[5]?.toFixed(3) || '0',
        j1: joints[0]?.toFixed(3) || '0',
        j2: joints[1]?.toFixed(3) || '0',
        j3: joints[2]?.toFixed(3) || '0',
        j4: joints[3]?.toFixed(3) || '0',
        j5: joints[4]?.toFixed(3) || '0',
        j6: joints[5]?.toFixed(3) || '0',
        isRealTime: true,
      };
      setTableData(prev => [...prev, newRow]);
    } catch (error) {
      console.error('현재 상태 가져오기 실패:', error);
      showAlert('현재 로봇 상태를 가져오는데 실패했습니다.', { type: 'error' });
    } finally {
      setIsLoading(false);
      setIsCreatingNewRow(false);
    }
  };
  const handleTableDataChange = (id: string, field: keyof TableRow, value: string) => {
    setTableData(prev => prev.map(row => (row.id === id ? { ...row, [field]: value } : row)));
  };
  const handleRowSelect = (id: string) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };
  const handleSelectAll = (currentPageIds: string[], allSelected: boolean) => {
    if (allSelected) {
      setSelectedRows(prev => {
        const newSet = new Set(prev);
        currentPageIds.forEach(id => newSet.delete(id));
        return newSet;
      });
    } else {
      setSelectedRows(prev => {
        const newSet = new Set(prev);
        currentPageIds.forEach(id => newSet.add(id));
        return newSet;
      });
    }
  };
  const handleDeleteSelected = () => {
    if (selectedRows.size === 0) {
      showAlert('삭제할 행을 선택해주세요.', { type: 'warning' });
      return;
    }
    if (confirm(`선택된 ${selectedRows.size}개 행을 삭제하시겠습니까?`)) {
      setTableData(prev => prev.filter(row => !selectedRows.has(row.id)));
      setSelectedRows(new Set());
    }
  };
  const handleSave = () => {
    showAlert('저장 기능은 아직 구현되지 않았습니다.', { type: 'info' });
  };
  const handleMoveRobot = async (row: TableRow) => {
    if (isMoving) return;
    setIsMoving(true);
    try {
      const joints = [
        parseFloat(row.j1),
        parseFloat(row.j2),
        parseFloat(row.j3),
        parseFloat(row.j4),
        parseFloat(row.j5),
        parseFloat(row.j6),
      ];
      await moveToJointPosition(joints, 50, 100, 100, -1, 0);
      showAlert(`로봇이 ${row.name}으로 이동했습니다.`, { type: 'success' });
    } catch (error) {
      console.error('로봇 이동 실패:', error);
      showAlert('로봇 이동에 실패했습니다. 서버 연결을 확인해주세요.', { type: 'error' });
    } finally {
      setIsMoving(false);
    }
  };
  const handleMoveToHome = async () => {
    if (isMoving) return;
    setIsMoving(true);
    try {
      await moveRobot();
    } catch (error) {
      console.error('로봇 이동 실패:', error);
      showAlert('로봇 이동에 실패했습니다. 서버 연결을 확인해주세요.', { type: 'error' });
    } finally {
      setIsMoving(false);
    }
  };
  return (
    <div className="min-h-screen dark bg-background p-8">
      <div className="max-w-7xl mx-auto">
        {}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold text-white">로봇 설정</h1>
          <Button
            onClick={() => navigate('/')}
            className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg"
          >
            메인으로 돌아가기
          </Button>
        </div>
        {}
        <CoordinateSettings
          robotSettings={robotSettings}
          setRobotSettings={setRobotSettingsState}
          isSettingsLoading={isSettingsLoading}
          onSave={saveRobotSettings}
        />
        {}
        <RobotPointTable
          tableData={tableData}
          isLoadingPoints={isLoadingPoints}
          isLoading={isLoading}
          isMoving={isMoving}
          isRealTimeUpdating={isRealTimeUpdating}
          selectedRows={selectedRows}
          onAddNewPoint={handleAddNewPoint}
          onRefreshPoints={loadRobotPoints}
          onSave={handleSave}
          onDeleteSelected={handleDeleteSelected}
          onToggleRealTime={() => setIsRealTimeUpdating(!isRealTimeUpdating)}
          onRowSelect={handleRowSelect}
          onSelectAll={handleSelectAll}
          onTableDataChange={handleTableDataChange}
          onMoveRobot={handleMoveRobot}
        />
        {}
        <div className="flex justify-end">
          <Button
            onClick={handleMoveToHome}
            disabled={isMoving}
            className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 text-white px-6 py-3 rounded-lg text-lg font-semibold"
          >
            {isMoving ? '이동 중...' : '🏠 시작점으로 이동'}
          </Button>
        </div>
      </div>
    </div>
  );
};
export default RobotSettings;
