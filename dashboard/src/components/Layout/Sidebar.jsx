import React from "react";
import { Layout, Menu, theme } from "antd";
import { useNavigate, useLocation } from "react-router-dom";
import {
  DashboardOutlined,
  UserOutlined,
  TeamOutlined,
  TransactionOutlined,
  BarChartOutlined,
  SettingOutlined,
  DollarOutlined,
  TrophyOutlined,
  GiftOutlined,
  GlobalOutlined,
  SafetyOutlined,
  FileTextOutlined,
  BankOutlined,
  PlayCircleOutlined,
  PieChartOutlined,
  NotificationOutlined,
  LineChartOutlined,
} from "@ant-design/icons";
import { useSelector } from "react-redux";
import { hasPermission, PERMISSIONS } from "../../utils/rolePermissions";
import logo from "../../assets/logo.png";
const { Sider } = Layout;

const Sidebar = ({ collapsed }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSelector((state) => state.auth);
  const {
    token: { colorBgContainer },
  } = theme.useToken();

  const menuItems = [
    {
      key: "/dashboard",
      icon: <DashboardOutlined />,
      label: "Dashboard",
    },
    {
      key: "/users",
      icon: <UserOutlined />,
      label: "User Management",
      disabled:
        user?.role === "agent"
          ? false
          : !hasPermission(user, PERMISSIONS.VIEW_USERS) &&
            !hasPermission(user, PERMISSIONS.CREATE_USERS) &&
            !hasPermission(user, PERMISSIONS.EDIT_USERS) &&
            !hasPermission(user, PERMISSIONS.RESET_USER_PASSWORD),
    },
    {
      key: "/commission",
      icon: <PieChartOutlined />,
      label: "Commission",
      disabled:
        !hasPermission(user, PERMISSIONS.VIEW_COMMISSION) ||
        (user?.role !== "master_agent" &&
          user?.role !== "sub_agent" &&
          user?.role !== "agent"),
    },
    {
      key: "/turnover",
      icon: <LineChartOutlined />,
      label: "Turnover Analytics",
      disabled:
        !hasPermission(user, PERMISSIONS.VIEW_COMMISSION) &&
        user?.role !== "admin",
    },
    {
      key: "agent-hierarchy",
      icon: <TeamOutlined />,
      label: "Agent Hierarchy",
      disabled: !hasPermission(user, PERMISSIONS.VIEW_AGENTS),
      children: [
        {
          key: "/agents",
          label: "Agent Management",
        },
        {
          key: "/agent-permissions",
          label: "Agent Permissions",
          disabled: !hasPermission(user, PERMISSIONS.MANAGE_AGENT_PERMISSIONS),
        },
        // {
        //   key: '/commission',
        //   label: 'Commission Management',
        //   disabled: !hasPermission(user, PERMISSIONS.MANAGE_COMMISSIONS),
        // },
      ],
    },
    {
      key: "financial",
      icon: <BankOutlined />,
      label: "Financial Management",
      disabled: user?.role !== "admin",
      children: [
        {
          key: "/transactions",
          icon: <TransactionOutlined />,
          label: "Transactions",
          disabled: !hasPermission(user, PERMISSIONS.VIEW_TRANSACTIONS),
        },
        // {
        //   key: '/wallet',
        //   icon: <DollarOutlined />,
        //   label: 'Wallet Management',
        //   disabled: !hasPermission(user, PERMISSIONS.MANAGE_WALLET),
        // },
        {
          key: "/agent-balance",
          label: "Agent Balance Control",
          disabled: !hasPermission(user, PERMISSIONS.ADJUST_USER_BALANCE),
        },
      ],
    },
    {
      key: "gaming",
      icon: <PlayCircleOutlined />,
      label: "Games & Providers",
      disabled: !hasPermission(user, PERMISSIONS.MANAGE_GAMES),
      children: [
        {
          key: "/games",
          label: "Game Management",
        },
        // {
        //   key: '/game-config',
        //   label: 'Game Configuration',
        // },
        // {
        //   key: '/provider-health',
        //   label: 'Provider Health',
        //   disabled: !hasPermission(user, PERMISSIONS.VIEW_PROVIDER_HEALTH),
        // },
      ],
    },
    {
      key: "reports",
      icon: <BarChartOutlined />,
      label: "Reports & Analytics",
      disabled:
        !hasPermission(user, PERMISSIONS.VIEW_REPORTS) ||
        user?.role !== "admin",
      children: [
        {
          key: "/reports/financial",
          label: "Financial Reports",
        },
        // {
        //   key: "/reports/commission",
        //   label: "Commission Reports",
        // },
        // {
        //   key: "/reports/analytics",
        //   label: "Analytics Dashboard",
        //   disabled: !hasPermission(user, PERMISSIONS.VIEW_ANALYTICS),
        // },
      ],
    },
    {
      key: "promotions",
      icon: <GiftOutlined />,
      label: "Bonus & Promotions",
      disabled: !hasPermission(user, PERMISSIONS.MANAGE_PROMOTIONS),
      children: [
        {
          key: "/promotions",
          label: "Promo Code Management",
        },
        // {
        //   key: "/promotions",
        //   label: "Auto Promo Rules",
        //   disabled: true,
        // },
      ],
    },
    {
      key: "content",
      icon: <FileTextOutlined />,
      label: "Content Management",
      disabled: !hasPermission(user, PERMISSIONS.MANAGE_CONTENT),
      children: [
        {
          key: "/cms",
          label: "CMS Content",
        },
        // {
        //   key: "/seo-settings",
        //   label: "SEO Settings",
        //   disabled: !hasPermission(user, PERMISSIONS.MANAGE_SEO),
        // },
      ],
    },
    // {
    //   key: "system",
    //   icon: <SettingOutlined />,
    //   label: "System Management",
    //   disabled: !hasPermission(user, PERMISSIONS.MANAGE_SETTINGS),
    //   children: [
    //     {
    //       key: "/settings",
    //       label: "General Settings",
    //     },
    //     {
    //       key: "/system/health",
    //       label: "System Health",
    //       disabled: !hasPermission(user, PERMISSIONS.VIEW_SYSTEM_HEALTH),
    //     },
    //     {
    //       key: "/fraud-detection",
    //       label: "Fraud Detection",
    //       disabled: !hasPermission(user, PERMISSIONS.MANAGE_FRAUD_DETECTION),
    //     },
    //     {
    //       key: "/notifications",
    //       label: "Notifications",
    //       icon: <NotificationOutlined />,
    //     },
    //   ],
    // },
  ];

  // Filter menu items based on user permissions
  const filterMenuItems = (items) => {
    return items
      .filter((item) => {
        // If item is disabled (no permission), exclude it
        if (item.disabled) return false;

        // If item has children, recursively filter them
        if (item.children) {
          item.children = filterMenuItems(item.children);
          // Only show parent if it has at least one visible child
          return item.children.length > 0;
        }

        return true;
      })
      .map((item) => ({ ...item })); // Create a shallow copy
  };

  const filteredMenuItems = filterMenuItems(menuItems);

  const handleMenuClick = ({ key }) => {
    navigate(key);
  };

  // Keep all parent menus expanded (when not collapsed)
  const alwaysOpenKeys = filteredMenuItems
    .filter((item) => item.children && item.children.length > 0)
    .map((item) => item.key);

  return (
    <Sider
      trigger={null}
      collapsible
      collapsed={collapsed}
      style={{ background: colorBgContainer }}
      className="shadow-lg"
    >
      <div className="p-4 bg-[#205583] text-center border-b">
        <img src={logo} alt="TenBet live" className="h-16" />
      </div>

      <Menu
        mode="inline"
        selectedKeys={[location.pathname]}
        openKeys={collapsed ? [] : alwaysOpenKeys}
        items={filteredMenuItems}
        onClick={handleMenuClick}
        className="mt-4 border-none"
      />
    </Sider>
  );
};

export default Sidebar;
