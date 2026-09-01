import { TeachingPoint, getExecutableParts, flattenExecutableParts, WEAVING_TYPE_OPTIONS, PartWeldEnabled, getPartBoundaryInfo } from '../..';
import { enableRobot, RealtimeRobotStatus, startArc, endArc, endWeave, getWeldingConfig, WeldingConfigData, moveToJointPositionNonBlocking, checkMotionDone, createWeldingLog, WeldingLogData, WeldingLogSegment, wireSearchEnd, findDx, findDy, findDz, setWeaveParams, startWeave, arcOn, arcOff, getRobotSettings, moveToCartesianPosition, getInverseKin, arcTraceControl, batchMoveL, BatchMovePoint, getWeldingPartOrder, isApiSuccess } from '../../../../lib';
import { createLogger } from '../../../../lib';
import React from 'react';
import { setWeldingPartOrder } from '../..';

export interface WeldingSequenceSettings {
  touchSensingEnabled: boolean;
  touchSpeed: number;
  touchDistance: number;
  touchOffsetDepth: number;
  touchApproachOffset: number;
  touchSensingPointSpeed: number;
  p1TouchCenter: boolean;
  p1TouchLeft: boolean;
  p1TouchRight: boolean;
  p1TouchBottom: boolean;
  p2TouchCenter: boolean;
  p2TouchLeft: boolean;
  p2TouchRight: boolean;
  p3TouchCenter: boolean;
  p3TouchLeft: boolean;
  p3TouchRight: boolean;
  p3TouchBottom: boolean;
  p4TouchCenter: boolean;
  p4TouchTop: boolean;
  p4TouchBottom: boolean;
  p4TouchSide: boolean;
  p5TouchCenter: boolean;
  p5TouchTop: boolean;
  p5TouchBottom: boolean;
  p6TouchCenter: boolean;
  p6TouchTop: boolean;
  p6TouchBottom: boolean;
  p7TouchCenter: boolean;
  p7TouchLeft: boolean;
  p7TouchRight: boolean;
  p8TouchCenter: boolean;
  p8TouchLeft: boolean;
  p8TouchRight: boolean;
  p9TouchCenter: boolean;
  p9TouchLeft: boolean;
  p9TouchRight: boolean;
  p9TouchBottom: boolean;
  p10TouchCenter: boolean;
  p10TouchTop: boolean;
  p10TouchBottom: boolean;
  p10TouchSide: boolean;
  p11TouchCenter: boolean;
  p11TouchTop: boolean;
  p11TouchBottom: boolean;
  p12TouchCenter: boolean;
  p12TouchTop: boolean;
  p12TouchBottom: boolean;
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
  gasPreFlowTime: number;
  gasPostFlowTime: number;
}
export interface TouchSensingResult {
  pointId: string;
  dx: number;
  dy: number;
  dz: number;
}
export interface TouchSensingOptions {
  touchBottom?: boolean;
  depthOffset?: number;
  isDryRun?: boolean;
  manualSpeed?: number;
  partWeldEnabled?: PartWeldEnabled;
  suppressAlerts?: boolean;
  onUpdatePoint?: (pointId: string, offset: { dx: number; dy: number; dz: number }) => void;
  skipHomeReturn?: boolean;  // 터치센싱 후 자동 홈복귀 스킵 (자동용접 흐름용)
}
export interface ClosestCenterlineResult {
  centerlineTcp: { x: number; y: number; z: number; rx: number; ry: number; rz: number };
  segmentStartIndex: number;
  closestTeachingPointIndex: number;
  distance: number;
  segmentRatio: number;
  segmentLength: number;
}
export interface WeldingStartOptions {
  startFromClosest?: boolean;
  currentTcp?: number[];
  manualMoveSpeed?: number;
  isDryRun?: boolean;
  isWeldingTest?: boolean;
  partWeldEnabled?: PartWeldEnabled;
}
export interface WeldingResult {
  operationType: 'welding' | 'dryrun' | 'simulation';
  jobId?: number;
  jobName?: string;
  startedAt: Date;
  completedAt: Date;
  totalDistanceMm: number;
  cpm: number;
  expectedDurationSec: number;
  actualDurationSec: number;
  timeDifferenceSec: number;
  timeDifferencePercent: number;
  segments: WeldingLogSegment[];
  totalPoints: number;
  completedPoints: number;
  resultStatus: 'success' | 'failed' | 'stopped';
  errorMessage?: string;
  logId?: number;
}
export interface UseWeldingOperationsReturn {
  isArcTesting: boolean;
  isWelding: boolean;
  arcActive: boolean;
  isTouchSensing: boolean;
  currentPointIndex: number;
  simulationMode: boolean;
  dryRunMode: boolean;
  lastWeldingResult: WeldingResult | null;
  startArcTest: (teachingPoints: TeachingPoint[], robotState: RealtimeRobotStatus | null, manualSpeed: number, isSimulation: boolean) => Promise<void>;
  stopArcTest: () => Promise<void>;
  startTouchSensing: (
    teachingPoints: TeachingPoint[],
    robotState: RealtimeRobotStatus | null,
    options?: TouchSensingOptions
  ) => Promise<TouchSensingResult[]>;
  stopTouchSensing: () => Promise<void>;
  startWelding: (teachingPoints: TeachingPoint[], robotState: RealtimeRobotStatus | null, simulationMode: boolean, jobId?: number, jobName?: string, options?: WeldingStartOptions) => Promise<WeldingResult | null>;
  stopWelding: () => Promise<void>;
  findClosestCenterlinePoint: (teachingPoints: TeachingPoint[], currentTcp: number[], partWeldEnabled?: PartWeldEnabled) => ClosestCenterlineResult | null;
  setSimulationMode: (enabled: boolean) => void;
  setDryRunMode: (enabled: boolean) => void;
}
