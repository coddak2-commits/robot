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
          {}
          <Route path="/dashboard" element={<Dashboard />} />
          {}
          <Route path="/jobs" element={<JobManagement />} />
          {}
          <Route path="/settings" element={<SystemSettings />} />
          {}
          <Route
            path="/cell-selection"
            element={<CellSelectionCore onStateChange={() => undefined} />}
          />
          {}
          <Route path="/settings/welding" element={<WeldingSetting />} />
          <Route path="/settings/robot" element={<RobotSettings />} />
          {}
          <Route path="/robot-control" element={<RobotTest />} />
          {/* 갭 시스템 신규 페이지 (Layout 안, 인증 컨텍스트 필요) */}
          <Route path="/gap/gap-input" element={<GapInputPage />} />
          <Route path="/gap/params" element={<ParamsPage />} />
          <Route path="/gap/promotions" element={<PromotionsPage />} />
          <Route path="/gap/wire-inching" element={<WireInchingPage />} />
        </Route>
        <Route path="pendant" element={<PendantPage />} />
        <Route path="menu" element={<Main />} />
        <Route path="login" element={<Login />} />
        {/* 갭 시스템 로그인 */}
        <Route path="gap/login" element={<GapLoginPage />} />
        <Route index element={<Login />} />
      </Routes>
    </BrowserRouter>
  );
};
export default Router;
