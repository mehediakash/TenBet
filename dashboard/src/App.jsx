import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";
import { Provider, useSelector } from "react-redux";
import { ConfigProvider } from "antd";
import store from "./store/store";
import { PERMISSIONS } from "./utils/rolePermissions";

// Layout Components
import MainLayout from "./layouts/MainLayout";
import AuthLayout from "./layouts/AuthLayout";

// Auth Components
import Login from "./pages/Auth/Login";
import ForgotPassword from "./pages/Auth/ForgotPassword";

// Dashboard Components
import AdminDashboard from "./pages/Dashboard/AdminDashboard";
import MasterAgentDashboard from "./pages/Dashboard/MasterAgentDashboard";
import AgentDashboard from "./pages/Dashboard/AgentDashboard";
import SubAgentDashboard from "./pages/Dashboard/SubAgentDashboard";

// Management Components
import UserManagement from "./pages/Management/UserManagement";
import AgentManagement from "./pages/Management/AgentManagement";
import TransactionManagement from "./pages/Management/TransactionManagement";
import AgentBalanceManagement from "./pages/AgentBalance/AgentBalanceManagement";

// Wallet Components
import WalletTransfer from "./pages/Wallet/WalletTransfer";

// Commission Components
import CommissionWithdrawal from "./pages/Commission/CommissionWithdrawal";
import CommissionDashboard from "./pages/Commission/CommissionDashboard";

// Game Components
import GameLauncher from "./pages/Games/GameLauncher";
import GameConfig from "./pages/Games/GameConfig";

// Sports Components
import RealTimeEvents from "./pages/Sports/RealTimeEvents";

// Promotion Components
import PromotionManagement from "./pages/Promotions/PromotionManagement";

// Settings Components
import AutoApprovalSettings from "./pages/Settings/AutoApprovalSettings";
import SEOSettings from "./pages/Settings/SEOSettings";

// CMS Components
import ContentManagement from "./pages/CMS/ContentManagement";

// System Components
import HealthMonitoring from "./pages/System/HealthMonitoring";
import FraudDetection from "./pages/Security/FraudDetection";

// Agent Components
import AgentPermissions from "./pages/Agents/AgentPermissions";

// Report Components
import FinancialReports from "./pages/Reports/FinancialReports";
import CommissionReports from "./pages/Reports/CommissionReports";
import AnalyticsDashboard from "./pages/Reports/AnalyticsDashboard";
import TurnoverDashboard from "./pages/TurnoverDashboard";

// Protected Route Component
import ProtectedRoute from "./components/Common/ProtectedRoute";

// CSS
import "./styles/globals.css";

function App() {
  return (
    <Provider store={store}>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: "#2563eb",
          },
        }}
      >
        <Router>
          <div className="App">
            <Routes>
              {/* Auth Routes */}
              <Route path="/auth" element={<AuthLayout />}>
                <Route path="login" element={<Login />} />
                <Route path="forgot-password" element={<ForgotPassword />} />
              </Route>

              {/* Protected Routes */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <MainLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardRouter />} />

                {/* Management Routes */}
                <Route path="users" element={<UserManagement />} />
                <Route path="agents" element={<AgentManagement />} />
                <Route
                  path="transactions"
                  element={
                    <ProtectedRoute
                      requiredPermission={PERMISSIONS.VIEW_TRANSACTIONS}
                    >
                      <TransactionManagement />
                    </ProtectedRoute>
                  }
                />

                {/* Wallet Routes */}
                <Route
                  path="wallet"
                  element={
                    <ProtectedRoute>
                      <WalletTransfer />
                    </ProtectedRoute>
                  }
                />

                {/* Commission Routes */}
                <Route
                  path="commission"
                  element={
                    <ProtectedRoute
                      requiredPermission={PERMISSIONS.VIEW_COMMISSION}
                    >
                      <CommissionDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="commission/withdrawal"
                  element={
                    <ProtectedRoute
                      requiredPermission={PERMISSIONS.WITHDRAW_COMMISSION}
                    >
                      <CommissionWithdrawal />
                    </ProtectedRoute>
                  }
                />

                {/* Turnover Routes */}
                <Route
                  path="turnover"
                  element={
                    <ProtectedRoute
                      requiredPermission={PERMISSIONS.VIEW_COMMISSION}
                    >
                      <TurnoverDashboard />
                    </ProtectedRoute>
                  }
                />

                {/* Games Routes */}
                <Route
                  path="games"
                  element={
                    <ProtectedRoute>
                      <GameLauncher />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="game-config"
                  element={
                    <ProtectedRoute>
                      <GameConfig />
                    </ProtectedRoute>
                  }
                />

                {/* Sports Routes */}
                <Route
                  path="sports"
                  element={
                    <ProtectedRoute>
                      <RealTimeEvents />
                    </ProtectedRoute>
                  }
                />

                {/* Promotions Routes */}
                <Route
                  path="promotions"
                  element={
                    <ProtectedRoute
                      requiredPermission={PERMISSIONS.MANAGE_PROMOTIONS}
                    >
                      <PromotionManagement />
                    </ProtectedRoute>
                  }
                />

                {/* Agent Balance Management */}
                <Route
                  path="agent-balance"
                  element={
                    <ProtectedRoute
                      requiredPermission={PERMISSIONS.ADJUST_USER_BALANCE}
                    >
                      <AgentBalanceManagement />
                    </ProtectedRoute>
                  }
                />

                {/* Settings Routes */}
                <Route
                  path="settings"
                  element={
                    <ProtectedRoute
                      requiredPermission={PERMISSIONS.MANAGE_SETTINGS}
                    >
                      <SettingsRouter />
                    </ProtectedRoute>
                  }
                >
                  <Route
                    index
                    element={<Navigate to="auto-approval" replace />}
                  />
                  <Route
                    path="auto-approval"
                    element={<AutoApprovalSettings />}
                  />
                  <Route path="seo" element={<SEOSettings />} />
                </Route>

                {/* CMS Routes */}
                <Route
                  path="cms"
                  element={
                    <ProtectedRoute
                      requiredPermission={PERMISSIONS.MANAGE_SETTINGS}
                    >
                      <ContentManagement />
                    </ProtectedRoute>
                  }
                />

                {/* System Routes */}
                <Route
                  path="system"
                  element={
                    <ProtectedRoute
                      requiredPermission={PERMISSIONS.MANAGE_SETTINGS}
                    >
                      <SystemRouter />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Navigate to="health" replace />} />
                  <Route path="health" element={<HealthMonitoring />} />
                  <Route path="fraud" element={<FraudDetection />} />
                </Route>

                {/* Agent Permissions */}
                <Route
                  path="agent-permissions"
                  element={
                    <ProtectedRoute
                      requiredPermission={PERMISSIONS.EDIT_AGENTS}
                    >
                      <AgentPermissions />
                    </ProtectedRoute>
                  }
                />

                {/* Report Routes */}
                <Route path="reports" element={<ReportsRouter />}>
                  <Route index element={<Navigate to="financial" replace />} />
                  <Route path="financial" element={<FinancialReports />} />
                  <Route path="commission" element={<CommissionReports />} />
                  <Route path="analytics" element={<AnalyticsDashboard />} />
                </Route>
              </Route>

              {/* Fallback Route */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </Router>
      </ConfigProvider>
    </Provider>
  );
}

// Component to route to appropriate dashboard based on user role
const DashboardRouter = () => {
  const user = useSelector((state) => state.auth.user);

  // If no user, let ProtectedRoute handle the redirect
  if (!user) {
    return null;
  }

  switch (user.role) {
    case "admin":
      return <AdminDashboard />;
    case "master_agent":
      return <MasterAgentDashboard />;
    case "agent":
      return <AgentDashboard />;
    case "sub_agent":
      return <SubAgentDashboard />;
    default:
      // If role is unrecognized, show admin dashboard as fallback or a default message
      return <AdminDashboard />;
  }
};

// Settings Router Component
const SettingsRouter = () => {
  return <Outlet />;
};

// System Router Component
const SystemRouter = () => {
  return <Outlet />;
};

// Reports Router Component
const ReportsRouter = () => {
  return <Outlet />;
};

export default App;
