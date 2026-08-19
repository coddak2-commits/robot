import React, { useState, useEffect, useCallback } from 'react';
import {
  mockGetRobotStatus,
  mockMoveRobot,
  mockStopRobot,
  mockChangeMode,
} from '../../lib';
import { RobotJoints, RobotTCF } from '../../types/RobotData';
import { JointDisplay_JointDisplay as JointDisplay } from './components';
import { TcpDisplay_TcpDisplay as TcpDisplay } from './components';
import { JogControlPanel_JogControlPanel as JogControlPanel } from './components';
import { RightControlPanel_RightControlPanel as RightControlPanel } from './components';
const RobotControl: React.FC = () => {
  const [joints, setJoints] = useState<RobotJoints>({
    j1: 0, j2: -90, j3: 90, j4: -180, j5: -90, j6: 0,
  });
  const [tcp, setTcp] = useState<RobotTCF>({
    x: -495, y: -130, z: 680, rx: -90, ry: 0, rz: 90,
  });
  const [speed, setSpeed] = useState(50);
  const [selectedJoint, setSelectedJoint] = useState<number>(1);
  const [controlMode, setControlMode] = useState<'joint' | 'cartesian'>('joint');
  const [isMoving, setIsMoving] = useState(false);
  const [robotMode, setRobotMode] = useState<0 | 1>(0);
  const [, setIsConnected] = useState(true);
  const fetchRobotStatus = useCallback(async () => {
    try {
      const status = await mockGetRobotStatus();
      if (status.data) {
        setJoints(status.data.joints);
        setTcp(status.data.tcp);
        setIsConnected(true);
      }
    } catch (error) {
      console.error('Failed to fetch robot status:', error);
      setIsConnected(false);
    }
  }, []);
  useEffect(() => {
    fetchRobotStatus();
    const interval = setInterval(fetchRobotStatus, 1000);
    return () => clearInterval(interval);
  }, [fetchRobotStatus]);
  const moveJoint = async (jointNum: number, delta: number) => {
    if (isMoving) return;
    setIsMoving(true);
    const jointKey = `j${jointNum}` as keyof RobotJoints;
    const newValue = Number(joints[jointKey]) + delta;
    try {
      await mockMoveRobot({ joints: { [jointKey]: newValue } });
      setJoints(prev => ({ ...prev, [jointKey]: newValue }));
    } catch (error) {
      console.error('Move failed:', error);
    } finally {
      setIsMoving(false);
    }
  };
  const moveCartesian = async (axis: keyof RobotTCF, delta: number) => {
    if (isMoving) return;
    setIsMoving(true);
    const newValue = Number(tcp[axis]) + delta;
    try {
      await mockMoveRobot({ tcf: { [axis]: newValue } });
      setTcp(prev => ({ ...prev, [axis]: newValue }));
    } catch (error) {
      console.error('Move failed:', error);
    } finally {
      setIsMoving(false);
    }
  };
  const stopRobot = async () => {
    try {
      await mockStopRobot();
      setIsMoving(false);
    } catch (error) {
      console.error('Stop failed:', error);
    }
  };
  const goHome = async () => {
    if (isMoving) return;
    setIsMoving(true);
    try {
      await mockMoveRobot({
        joints: { j1: 0, j2: -90, j3: 90, j4: -180, j5: -90, j6: 0 },
      });
      setJoints({ j1: 0, j2: -90, j3: 90, j4: -180, j5: -90, j6: 0 });
    } catch (error) {
      console.error('Home failed:', error);
    } finally {
      setIsMoving(false);
    }
  };
  const toggleMode = async () => {
    const newMode = robotMode === 0 ? 1 : 0;
    try {
      await mockChangeMode(newMode);
      setRobotMode(newMode as 0 | 1);
    } catch (error) {
      console.error('Mode change failed:', error);
    }
  };
  return (
    <div className="flex-1 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4 md:p-6 overflow-auto">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {}
        <div className="lg:col-span-3 space-y-4">
          <JointDisplay
            joints={joints}
            controlMode={controlMode}
            selectedJoint={selectedJoint}
            onSelectJoint={setSelectedJoint}
            onSetControlMode={setControlMode}
          />
          <TcpDisplay
            tcp={tcp}
            controlMode={controlMode}
            onSetControlMode={setControlMode}
          />
        </div>
        {}
        <JogControlPanel
          controlMode={controlMode}
          selectedJoint={selectedJoint}
          joints={joints}
          speed={speed}
          isMoving={isMoving}
          onControlModeChange={setControlMode}
          onSelectJoint={setSelectedJoint}
          onMoveJoint={moveJoint}
          onMoveCartesian={moveCartesian}
        />
        {}
        <RightControlPanel
          speed={speed}
          robotMode={robotMode}
          isMoving={isMoving}
          onSpeedChange={setSpeed}
          onToggleMode={toggleMode}
          onGoHome={goHome}
          onRefresh={fetchRobotStatus}
          onStop={stopRobot}
        />
      </div>
    </div>
  );
};
export default RobotControl;
