export interface RobotPosition {
  x: number;
  y: number;
  z: number;
  isWelding?: boolean;
  timestamp?: number;
}
export interface WeldPoint {
  id: string;
  x: number;
  y: number;
  z: number;
  order?: number;
  completed?: boolean;
  tcp?: { x: number; y: number; z: number } | null;
}
export interface UCellConfig {
  type: 'normal' | 'collar_plate';
  cellName: string;
  width: number;
  height: number;
  thickness: number;
  leftSegments?: number[];
  rightSegments?: number[];
  bottomSegments?: number[];
}
export interface WorkspaceConfig {
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  showGrid?: boolean;
  gridSpacing?: number;
}
export interface CenterlinePoint {
  schematic: { x: number; y: number };
  tcp: { x: number; y: number; z: number };
  distance: number;
  segmentIndex: number;
  segmentRatio: number;
  partIndex: number;
  segmentStartPointId: string;
  segmentEndPointId: string;
  orientation: { rx: number; ry: number; rz: number };
  toolNum: number;
  userNum: number;
}
export interface PartToggleConfig {
  index: number;
  name: string;
  enabled: boolean;
  position: { x: number; y: number };
  labelOffset?: { x: number; y: number };
  canToggle: boolean;
  savedPointCount: number;
  executionOrder?: number;
}
export type TransformFn = (pos: { x: number; y: number }) => { x: number; y: number };
export interface UnifiedWorkspaceCanvasProps {
  ucellConfig?: UCellConfig;
  workspaceConfig?: WorkspaceConfig;
  pathHistory?: RobotPosition[];
  currentPosition?: RobotPosition;
  pausedPosition?: RobotPosition;
  weldPoints?: WeldPoint[];
  centerlinePath?: { x: number; y: number }[];
  centerlinePoints?: CenterlinePoint[];
  onCenterlinePointClick?: (point: CenterlinePoint) => void;
  partWeldEnabled?: Record<number, boolean>;
  partSavedPointCounts?: Record<number, number>;
  onPartWeldToggle?: (partIndex: number) => void;
  ucellWidth?: number;
  ucellHeight?: number;
  canvasWidth?: number;
  canvasHeight?: number;
  colors?: {
    ucell?: string;
    movePath?: string;
    weldingPath?: string;
    currentPosition?: string;
    pausedPosition?: string;
    weldPoint?: string;
    weldPointCompleted?: string;
    grid?: string;
    centerline?: string;
  };
  animated?: boolean;
  onSegmentChange?: (bar: 'left' | 'right' | 'bottom', segment: number, value: number) => void;
  onWeldPointClick?: (point: WeldPoint) => void;
  onReorderPoints?: (activeId: string, overId: string) => void;
  currentPointId?: string | null;
  className?: string;
}
export const DEFAULT_WORKSPACE: WorkspaceConfig = {
  bounds: { minX: -500, maxX: 500, minY: -500, maxY: 500 },
  showGrid: true,
  gridSpacing: 100,
};
export const DEFAULT_COLORS = {
  ucell: '#6B7280',
  movePath: '#00F9FF',
  weldingPath: '#FF6B35',
  currentPosition: '#00FF88',
  pausedPosition: '#F97316',
  weldPoint: '#FBBF24',
  weldPointCompleted: '#10B981',
  grid: '#374151',
  centerline: '#FACC15',
};
