import { UCellData, HEIGHT_OPTIONS } from '..';

export interface SecondarySidebarProps {
  selectedType: 'normal' | 'collar_plate' | null;
  selectedHeight: number | null;
  selectedCell: UCellData | null;
  displayCells: UCellData[];
  selectedWidth: number;
  onClose: () => void;
  onHeightChange: (height: number) => void;
  onCellSelect: (cellId: number) => void;
}
export function SecondarySidebar({ selectedType, selectedHeight, selectedCell, displayCells, onClose, onHeightChange, onCellSelect }: SecondarySidebarProps) {
  return (
    <div className="w-64 bg-gray-800/95 backdrop-blur-sm border-r border-gray-700/50 flex-shrink-0">
      <div className="p-4 border-b border-gray-700/50 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">{selectedType === 'normal' ? '일반 U-Cell' : '컬러플레이트 U-Cell'}</h3>
        <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition">&#x2715;</button>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-2">T-bar 높이 선택</label>
          <select
            className="w-full bg-gray-700 border border-gray-600 text-white rounded-xl px-4 py-3 focus:border-cyan-500 focus:outline-none transition"
            value={selectedHeight?.toString() || ''}
            onChange={e => onHeightChange(parseInt(e.target.value))}
          >
            <option value="" disabled>::높이::</option>
            {HEIGHT_OPTIONS.map(option => (<option key={option.value} value={option.value.toString()}>{option.label}</option>))}
          </select>
        </div>
        {selectedHeight ? (
          <div>
            <label className="block text-sm text-gray-400 mb-3">U-Cell 선택</label>
            <div className="grid grid-cols-2 gap-3">
              {displayCells.map(cell => (
                <button
                  key={cell.id}
                  onClick={() => onCellSelect(cell.id)}
                  className={`p-3 rounded-xl border-2 transition touch-manipulation ${
                    selectedCell?.id === cell.id ? `bg-gradient-to-br ${cell.color} border-white text-white` : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  <div className="text-xs font-medium">{cell.name.split(' ')[0]}</div>
                  <div className="text-sm font-bold">{cell.name.match(/\(.*\)/)?.[0]}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">먼저 높이를 선택해주세요</div>
        )}
      </div>
    </div>
  );
}
