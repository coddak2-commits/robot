import React from 'react';
import { ConnectionPanel_ConnectionPanel as ConnectionPanel } from './components';
import { ArrowJointJogPanel_ArrowJointJogPanel as ArrowJointJogPanel } from './components';
import { ArrowCartesianJogPanel_ArrowCartesianJogPanel as ArrowCartesianJogPanel } from './components';
import { PositionDisplay_PositionDisplay as PositionDisplay } from './components';
import { MoveTargetPanel_MoveTargetPanel as MoveTargetPanel } from './components';
import { useRobotTestControl } from './hooks/useRobotTestControl';
const RobotTest: React.FC = () => {
  const {
    isConnected, isConnecting, robotIp, setRobotIp,
    error, robotStatus,
    connectRobot, disconnectRobot,
    jogMode, setJogMode, jogSpeed, setJogSpeed,
    activeJog, startJog, stopJog, emergencyStop,
    isServoLoading, enableServo, disableServo,
    joints, tcp,
    targetJoints, setTargetJoints, isMoving, moveResult,
    moveToTarget, copyCurrentToTarget, updateTargetJoint, addToAllJoints,
    isDancing, danceStep, danceSequence, startDance, stopDance,
  } = useRobotTestControl();
  return (
    <div className="flex-1 bg-gradient-to-br from-gray-900 via-slate-900 to-gray-800 p-4 md:p-6 text-white overflow-auto">
      <div className="max-w-7xl mx-auto">
        {}
        <ConnectionPanel
          robotIp={robotIp}
          setRobotIp={setRobotIp}
          isConnected={isConnected}
          isConnecting={isConnecting}
          connectRobot={connectRobot}
          disconnectRobot={disconnectRobot}
          robotStatus={robotStatus}
          isServoLoading={isServoLoading}
          enableServo={enableServo}
          disableServo={disableServo}
          jogSpeed={jogSpeed}
          setJogSpeed={setJogSpeed}
          emergencyStop={emergencyStop}
          error={error}
        />
        {}
        {isConnected && (
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setJogMode('joint')}
              className={`flex-1 py-3 rounded-xl font-bold transition-all ${
                jogMode === 'joint'
                  ? 'bg-cyan-500 text-black'
                  : 'bg-white/10 text-gray-400 hover:bg-white/20'
              }`}
            >
              관절 (Joint)
            </button>
            <button
              onClick={() => setJogMode('cartesian')}
              className={`flex-1 py-3 rounded-xl font-bold transition-all ${
                jogMode === 'cartesian'
                  ? 'bg-orange-500 text-black'
                  : 'bg-white/10 text-gray-400 hover:bg-white/20'
              }`}
            >
              직교 (Base)
            </button>
            <button
              onClick={() => setJogMode('tcp')}
              className={`flex-1 py-3 rounded-xl font-bold transition-all ${
                jogMode === 'tcp'
                  ? 'bg-purple-500 text-black'
                  : 'bg-white/10 text-gray-400 hover:bg-white/20'
              }`}
            >
              TCP (Tool)
            </button>
          </div>
        )}
        {}
        {isConnected && (
          <div className="bg-white/5 backdrop-blur rounded-2xl p-4 mb-4 border border-white/10">
            {jogMode === 'joint' ? (
              <ArrowJointJogPanel
                joints={joints}
                onJogStart={startJog}
                onJogStop={stopJog}
                activeJog={activeJog}
                disabled={!isConnected}
              />
            ) : (
              <>
                {jogMode === 'tcp' && (
                  <div className="mb-3 px-3 py-2 bg-purple-500/20 rounded-lg text-purple-300 text-sm">
                    TCP 좌표계 기준 이동 (툴 끝점 기준 X/Y/Z/Rx/Ry/Rz)
                  </div>
                )}
                <ArrowCartesianJogPanel
                  tcp={tcp}
                  onJogStart={startJog}
                  onJogStop={stopJog}
                  activeJog={activeJog}
                  disabled={!isConnected}
                />
              </>
            )}
          </div>
        )}
        {}
        <PositionDisplay joints={joints} tcp={tcp} />
        {}
        {isConnected && (
          <MoveTargetPanel
            joints={joints}
            targetJoints={targetJoints}
            setTargetJoints={setTargetJoints}
            jogSpeed={jogSpeed}
            isMoving={isMoving}
            moveResult={moveResult}
            moveToTarget={moveToTarget}
            copyCurrentToTarget={copyCurrentToTarget}
            updateTargetJoint={updateTargetJoint}
            addToAllJoints={addToAllJoints}
            isDancing={isDancing}
            danceStep={danceStep}
            danceSequence={danceSequence}
            startDance={startDance}
            stopDance={stopDance}
          />
        )}
      </div>
    </div>
  );
};
export default RobotTest;
