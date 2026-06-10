import React from 'react';
import { Layout, Dropdown, Avatar, Button, Space } from 'antd';
import { 
  MenuFoldOutlined, 
  MenuUnfoldOutlined, 
  UserOutlined, 
  LogoutOutlined,
  SettingOutlined 
} from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../../store/slices/authSlice';

const { Header: AntHeader } = Layout;

const Header = ({ collapsed, setCollapsed }) => {
  const dispatch = useDispatch();
  const { user } = useSelector(state => state.auth);

  const handleLogout = () => {
    dispatch(logout());
  };

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Profile',
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      onClick: handleLogout,
    },
  ];

  return (
    <AntHeader className="!bg-[#205583] shadow-sm !text-white flex items-center justify-between px-4">
      <Button
        type="text"
        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        onClick={() => setCollapsed(!collapsed)}
        className="text-lg"
      />
      
      <div className="flex items-center space-x-4">
        <span className="!text-white">
          Welcome, {user?.fullName || user?.email}
        </span>
        
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <Space className="cursor-pointer">
            <Avatar 
              icon={<UserOutlined />} 
              src={user?.avatar}
              className="bg-blue-500"
            />
          </Space>
        </Dropdown>
      </div>
    </AntHeader>
  );
};

export default Header;