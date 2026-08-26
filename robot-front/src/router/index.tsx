import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout_Layout as Layout } from '../components/layout';
import Main from '../pages/main/Main';
import Login from '../pages/login/Login';
import { CellSelectionCore } from '../pages/UcellSelect';
import WeldingSetting from '../pages/setting/Welding';
import RobotSettings from '../pages/robotOption/RobotSettings';
import Dashboard from '../pages/dashboard/Dashboard';
import JobManagement from '../pages/jobs/JobManagement';
import { SystemSettings_SystemSettings as SystemSettings } from '../pages/settings';
import RobotTest from '../pages/robot-test/RobotTest';
import { RequireRole } from '../contexts/gapAuth';
// 갭 시스템 신규 페이지
import GapLoginPage from '../pages/gap-login';
import GapInputPage from '../pages/gap-input';
import ParamsPage from '../pages/params';
import PromotionsPage from '../pages/promotions';
import WireInchingPage from '../pages/wire-inching';
import PendantPage from '../pages/pendant';

const Router = () => {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route element={<Layout />}>
          {/* 모두 조회 가능 */}
          <Route path="/dashboard" element={
            <RequireRole roles={['admin', 'operator', 'viewer']}><Dashboard /></RequireRole>
          } />
          {/* 작업/티칭/제어 - 관리자·작업자 */}
          <Route path="/jobs" element={
            <RequireRole roles={['admin', 'operator']}><JobManagement /></RequireRole>
          } />
          <Route path="/cell-selection" element={
            <RequireRole roles={['admin', 'operator']}>
              <CellSelectionCore onStateChange={() => undefined} />
            </RequireRole>
          } />
          <Route path="/robot-control" element={
            <RequireRole roles={['admin', 'operator']}><RobotTest /></RequireRole>
          } />
          <Route path="/gap/gap-input" element={
            <RequireRole roles={['admin', 'operator']}><GapInputPage /></RequireRole>
          } />
          <Route path="/gap/wire-inching" element={
            <RequireRole roles={['admin', 'operator']}><WireInchingPage /></RequireRole>
          } />
          {/* 관리자 전용 */}
          <Route path="/settings" element={
            <RequireRole roles={['admin']}><SystemSettings /></RequireRole>
          } />
          <Route path="/settings/welding" element={
            <RequireRole roles={['admin']}><WeldingSetting /></RequireRole>
          } />
          <Route path="/settings/robot" element={
            <RequireRole roles={['admin']}><RobotSettings /></RequireRole>
          } />
          <Route path="/gap/params" element={
            <RequireRole roles={['admin']}><ParamsPage /></RequireRole>
          } />
          <Route path="/gap/promotions" element={
            <RequireRole roles={['admin']}><PromotionsPage /></RequireRole>
          } />
        </Route>
        <Route path="pendant" element={<PendantPage />} />
        <Route path="menu" element={<Main />} />
        <Route path="login" element={<Login />} />
        <Route path="gap/login" element={<GapLoginPage />} />
        <Route index element={<Login />} />
      </Routes>
    </BrowserRouter>
  );
};
export default Router;
