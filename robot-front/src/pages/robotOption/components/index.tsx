import React, { useState } from 'react';
import { Button, FormInput } from '../../../components/common/index';
import { RobotSettingsData } from '../../../lib';
interface CoordinateSettingsProps {
  robotSettings: RobotSettingsData;
  setRobotSettings: React.Dispatch<React.SetStateAction<RobotSettingsData>>;
  isSettingsLoading: boolean;
  onSave: () => void;
}
const CoordinateSettings: React.FC<CoordinateSettingsProps> = ({
  robotSettings,
  setRobotSettings,
  isSettingsLoading,
  onSave,
}) => {
  return (
    <div
      className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6"
      data-audit="dup"
      data-audit-note="중복: 좌표계 설정 — /settings/robot 와 /settings(RobotSettingsTab)가 동일 robot_settings 편집"
      data-audit-loc="src/pages/robotOption/components/CoordinateSettings.tsx:19"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold text-white">좌표계 설정</h2>
        <Button
          onClick={onSave}
          disabled={isSettingsLoading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg"
        >
          {isSettingsLoading ? '저장 중...' : '설정 저장'}
        </Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <FormInput
          label="도구좌표계 (Tool)"
          labelSize="sm"
          hint="0~14"
          type="number"
          min={0}
          max={14}
          value={robotSettings.tool_num}
          onChange={e =>
            setRobotSettings(prev => ({ ...prev, tool_num: parseInt(e.target.value) || 0 }))
          }
          focusStyle="blue"
        />
        <FormInput
          label="사용자좌표계 (User)"
          labelSize="sm"
          hint="0~14"
          type="number"
          min={0}
          max={14}
          value={robotSettings.user_num}
          onChange={e =>
            setRobotSettings(prev => ({ ...prev, user_num: parseInt(e.target.value) || 0 }))
          }
          focusStyle="blue"
        />
        <FormInput
          label="기본 속도"
          labelSize="sm"
          unit="%"
          type="number"
          min={0}
          max={100}
          value={robotSettings.default_vel}
          onChange={e =>
            setRobotSettings(prev => ({ ...prev, default_vel: parseFloat(e.target.value) || 0 }))
          }
          focusStyle="blue"
        />
        <FormInput
          label="기본 가속도"
          labelSize="sm"
          unit="%"
          type="number"
          min={0}
          max={100}
          value={robotSettings.default_acc}
          onChange={e =>
            setRobotSettings(prev => ({ ...prev, default_acc: parseFloat(e.target.value) || 0 }))
          }
          focusStyle="blue"
        />
        <FormInput
          label="기본 오버라이드"
          labelSize="sm"
          unit="%"
          type="number"
          min={0}
          max={100}
          value={robotSettings.default_ovl}
          onChange={e =>
            setRobotSettings(prev => ({ ...prev, default_ovl: parseFloat(e.target.value) || 0 }))
          }
          focusStyle="blue"
        />
      </div>
      <p className="text-sm text-gray-500 mt-3">
        ※ 현장 로봇의 도구좌표계가 다를 경우 (예: toolcoord3 = Tool 3), 해당 번호로 설정하세요.
      </p>
    </div>
  );
};
export const CoordinateSettings_CoordinateSettings = CoordinateSettings;
interface RobotPointTableProps {
  tableData: TableRow[];
  isLoadingPoints: boolean;
  isLoading: boolean;
  isMoving: boolean;
  isRealTimeUpdating: boolean;
  selectedRows: Set<string>;
  onAddNewPoint: () => void;
  onRefreshPoints: () => void;
  onSave: () => void;
  onDeleteSelected: () => void;
  onToggleRealTime: () => void;
  onRowSelect: (id: string) => void;
  onSelectAll: (currentPageIds: string[], allSelected: boolean) => void;
  onTableDataChange: (id: string, field: keyof TableRow, value: string) => void;
  onMoveRobot: (row: TableRow) => void;
}
const RobotPointTable: React.FC<RobotPointTableProps> = ({
  tableData,
  isLoadingPoints,
  isLoading,
  isMoving,
  isRealTimeUpdating,
  selectedRows,
  onAddNewPoint,
  onRefreshPoints,
  onSave,
  onDeleteSelected,
  onToggleRealTime,
  onRowSelect,
  onSelectAll,
  onTableDataChange,
  onMoveRobot,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [pageGroupStart, setPageGroupStart] = useState(1);
  const totalPages = Math.ceil(tableData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentData = tableData.slice(startIndex, endIndex);
  const pageGroupEnd = Math.min(pageGroupStart + 9, totalPages);
  const pageNumbers = Array.from(
    { length: pageGroupEnd - pageGroupStart + 1 },
    (_, i) => pageGroupStart + i,
  );
  const handlePageChange = (page: number) => setCurrentPage(page);
  const handlePrevGroup = () => {
    const newGroupStart = Math.max(1, pageGroupStart - 10);
    setPageGroupStart(newGroupStart);
    setCurrentPage(newGroupStart);
  };
  const handleNextGroup = () => {
    const newGroupStart = Math.min(pageGroupStart + 10, totalPages);
    setPageGroupStart(newGroupStart);
    setCurrentPage(newGroupStart);
  };
  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };
  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };
  const handleSelectAll = () => {
    const currentPageIds = currentData.map(row => row.id);
    const allCurrentPageSelected = currentPageIds.every(id => selectedRows.has(id));
    onSelectAll(currentPageIds, allCurrentPageSelected);
  };
  const coordFields: (keyof TableRow)[] = ['x', 'y', 'z', 'rx', 'ry', 'rz'];
  const jointFields: (keyof TableRow)[] = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6'];
  const allValueFields = [...coordFields, ...jointFields];
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
      {}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold text-white">로봇 포인트 관리</h2>
        <div
          className="flex gap-2"
          data-audit="unused"
          data-audit-note="일부 미사용: '저장'(미구현 alert)·'생성'·'삭제'는 local state만 변경 — DB 미반영(새로고침 시 복원). 새로고침/실시간/행 '실행'은 정상"
          data-audit-loc="src/pages/robotOption/components/RobotPointTable.tsx:100"
        >
          <Button
            onClick={onRefreshPoints}
            disabled={isLoadingPoints}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg"
          >
            {isLoadingPoints ? '로딩 중...' : '새로고침'}
          </Button>
          <Button
            onClick={onAddNewPoint}
            disabled={isLoading}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg"
          >
            {isLoading ? '로딩 중...' : '생성'}
          </Button>
          <Button
            onClick={onSave}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
          >
            저장
          </Button>
          <Button
            onClick={onDeleteSelected}
            disabled={selectedRows.size === 0}
            className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg"
          >
            삭제
          </Button>
          <Button
            onClick={onToggleRealTime}
            className={`${isRealTimeUpdating ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-gray-600 hover:bg-gray-700'} text-white px-4 py-2 rounded-lg`}
          >
            {isRealTimeUpdating ? '실시간 ON' : '실시간 OFF'}
          </Button>
        </div>
      </div>
      {}
      <div className="overflow-x-auto">
        {isLoadingPoints ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-300 text-lg">포인트 데이터를 불러오는 중...</p>
            </div>
          </div>
        ) : tableData.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <p className="text-gray-300 text-lg">포인트 데이터가 없습니다.</p>
            </div>
          </div>
        ) : (
          <table className="w-full text-sm text-left text-gray-300">
            <thead className="text-xs text-gray-400 uppercase bg-gray-700">
              <tr>
                <th className="px-2 py-3">
                  <input
                    type="checkbox"
                    checked={
                      currentData.length > 0 && currentData.every(row => selectedRows.has(row.id))
                    }
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                </th>
                <th className="w-24">Name</th>
                {['X', 'Y', 'Z', 'RX', 'RY', 'RZ', 'J1', 'J2', 'J3', 'J4', 'J5', 'J6'].map(h => (
                  <th key={h} className="">
                    {h}
                  </th>
                ))}
                <th className="">실행</th>
              </tr>
            </thead>
            <tbody>
              {currentData.map(row => (
                <tr
                  key={row.id}
                  data-row-id={row.id}
                  className={`${row.isRealTime ? 'bg-blue-900/30 border-blue-600' : 'bg-gray-800 border-gray-700'} border-b hover:bg-gray-700`}
                >
                  <td className="">
                    <input
                      type="checkbox"
                      checked={selectedRows.has(row.id)}
                      onChange={() => onRowSelect(row.id)}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                    />
                  </td>
                  <td className="w-24">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={row.name}
                        onChange={e => onTableDataChange(row.id, 'name', e.target.value)}
                        className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </td>
                  {allValueFields.map(field => (
                    <td key={field} className="">
                      <input
                        type="text"
                        value={row[field] as string}
                        onChange={e => onTableDataChange(row.id, field, e.target.value)}
                        className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                  ))}
                  <td className="">
                    <Button
                      onClick={() => onMoveRobot(row)}
                      disabled={isMoving}
                      className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white px-3 py-1 rounded text-sm"
                    >
                      {isMoving ? '이동 중...' : '실행'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {}
      {tableData.length > 0 && (
        <div className="flex items-center justify-between mt-4 px-4 py-3 bg-gray-700 rounded-lg">
          <div className="text-sm text-gray-300">
            총 {tableData.length}개 항목 중 {startIndex + 1}-{Math.min(endIndex, tableData.length)}
            개 표시
          </div>
          <div className="flex items-center gap-2">
            {pageGroupStart > 1 && (
              <Button
                onClick={handlePrevGroup}
                className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded text-sm"
              >
                ≪
              </Button>
            )}
            <Button
              onClick={handlePrevPage}
              disabled={currentPage === 1}
              className="bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:text-gray-400 text-white px-3 py-1 rounded text-sm"
            >
              이전
            </Button>
            {pageNumbers.map(pageNum => (
              <Button
                key={pageNum}
                onClick={() => handlePageChange(pageNum)}
                className={`px-3 py-1 rounded text-sm ${
                  currentPage === pageNum
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-600 hover:bg-gray-500 text-white'
                }`}
              >
                {pageNum}
              </Button>
            ))}
            <Button
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              className="bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:text-gray-400 text-white px-3 py-1 rounded text-sm"
            >
              다음
            </Button>
            {pageGroupEnd < totalPages && (
              <Button
                onClick={handleNextGroup}
                className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded text-sm"
              >
                ≫
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
export const RobotPointTable_RobotPointTable = RobotPointTable;
export interface TableRow {
  id: string;
  name: string;
  x: string;
  y: string;
  z: string;
  rx: string;
  ry: string;
  rz: string;
  j1: string;
  j2: string;
  j3: string;
  j4: string;
  j5: string;
  j6: string;
  isRealTime: boolean;
}
export { CoordinateSettings_CoordinateSettings as CoordinateSettings };
export { RobotPointTable_RobotPointTable as RobotPointTable };
