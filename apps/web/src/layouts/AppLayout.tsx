import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Layout,
  Menu,
  Avatar,
  Dropdown,
  Space,
  Typography,
  Tag,
  Button,
  theme,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  HistoryOutlined,
  TeamOutlined,
  EnvironmentOutlined,
  AppstoreOutlined,
  SafetyCertificateOutlined,
  BarChartOutlined,
  FileProtectOutlined,
  UserOutlined,
  LogoutOutlined,
  IdcardOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext.js';
import { PermissionKey } from '@workforce/shared';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

export const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'user-header',
      label: (
        <div style={{ padding: '4px 0' }}>
          <Text strong>{user?.name}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {user?.email} ({user?.employee_code})
          </Text>
        </div>
      ),
      disabled: true,
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Sign Out',
      danger: true,
      onClick: handleLogout,
    },
  ];

  const menuItems: MenuProps['items'] = [
    {
      key: 'group-employee',
      type: 'group',
      label: 'EMPLOYEE SELF SERVICE',
      children: [
        {
          key: '/employee/dashboard',
          icon: <DashboardOutlined />,
          label: 'Dashboard',
          onClick: () => navigate('/employee/dashboard'),
        },
        {
          key: '/employee/attendance/check-in',
          icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
          label: 'Face Check-In',
          onClick: () => navigate('/employee/attendance/check-in'),
        },
        {
          key: '/employee/attendance/check-out',
          icon: <CloseCircleOutlined style={{ color: '#fa8c16' }} />,
          label: 'Face Check-Out',
          onClick: () => navigate('/employee/attendance/check-out'),
        },
        {
          key: '/employee/face-enrollment',
          icon: <IdcardOutlined style={{ color: '#1677ff' }} />,
          label: 'Face Registration',
          onClick: () => navigate('/employee/face-enrollment'),
        },
        {
          key: '/employee/attendance',
          icon: <HistoryOutlined />,
          label: 'My Attendance',
          onClick: () => navigate('/employee/attendance'),
        },
      ],
    },
  ];

  // Admin / Management items conditionally added based on permissions
  const canViewAdmin =
    hasPermission(PermissionKey.USER_READ) ||
    hasPermission(PermissionKey.OFFICE_READ) ||
    hasPermission(PermissionKey.REPORTS_READ);

  if (canViewAdmin) {
    const adminChildren: any[] = [];

    if (hasPermission(PermissionKey.REPORTS_READ)) {
      adminChildren.push({
        key: '/admin/dashboard',
        icon: <DashboardOutlined />,
        label: 'Admin Overview',
        onClick: () => navigate('/admin/dashboard'),
      });
    }

    if (hasPermission(PermissionKey.USER_READ)) {
      adminChildren.push({
        key: '/admin/users',
        icon: <TeamOutlined />,
        label: 'Employees',
        onClick: () => navigate('/admin/users'),
      });
    }

    if (hasPermission(PermissionKey.OFFICE_READ)) {
      adminChildren.push({
        key: '/admin/offices',
        icon: <EnvironmentOutlined />,
        label: 'Office Geofences',
        onClick: () => navigate('/admin/offices'),
      });
    }

    if (hasPermission(PermissionKey.DEPARTMENT_READ)) {
      adminChildren.push({
        key: '/admin/departments',
        icon: <AppstoreOutlined />,
        label: 'Departments',
        onClick: () => navigate('/admin/departments'),
      });
    }

    if (hasPermission(PermissionKey.ROLE_READ)) {
      adminChildren.push({
        key: '/admin/roles',
        icon: <SafetyCertificateOutlined />,
        label: 'Roles & RBAC',
        onClick: () => navigate('/admin/roles'),
      });
    }

    if (hasPermission(PermissionKey.REPORTS_READ)) {
      adminChildren.push({
        key: '/admin/reports',
        icon: <BarChartOutlined />,
        label: 'Reports & CSV Export',
        onClick: () => navigate('/admin/reports'),
      });
    }

    if (hasPermission(PermissionKey.AUDIT_READ)) {
      adminChildren.push({
        key: '/admin/audit-logs',
        icon: <FileProtectOutlined />,
        label: 'Audit Trail',
        onClick: () => navigate('/admin/audit-logs'),
      });
    }

    if (adminChildren.length > 0) {
      menuItems.push({
        key: 'group-admin',
        type: 'group',
        label: 'ENTERPRISE ADMINISTRATION',
        children: adminChildren,
      });
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="light"
        width={260}
        style={{
          borderRight: `1px solid ${token.colorBorderSecondary}`,
          overflow: 'auto',
          height: '100vh',
          position: 'sticky',
          top: 0,
          left: 0,
        }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            padding: '0 20px',
            gap: 10,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <IdcardOutlined style={{ fontSize: 24, color: token.colorPrimary }} />
          {!collapsed && (
            <div>
              <Text strong style={{ fontSize: 16 }}>
                Workforce Access
              </Text>
              <br />
              <Text type="secondary" style={{ fontSize: 11 }}>
                Biometric + Geofence
              </Text>
            </div>
          )}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          defaultOpenKeys={['group-employee', 'group-admin']}
          items={menuItems}
          style={{ borderRight: 0 }}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            background: token.colorBgContainer,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            position: 'sticky',
            top: 0,
            zIndex: 100,
          }}
        >
          <Space>
            <Tag color="blue">{user?.office_name || 'Assigned Office'}</Tag>
            <Tag color="cyan">{user?.department_name || 'Department'}</Tag>
            <Tag color="purple">{user?.role_name}</Tag>
          </Space>

          <Space size="middle">
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Button type="text" style={{ height: 'auto', padding: '4px 8px' }}>
                <Space>
                  <Avatar icon={<UserOutlined />} style={{ backgroundColor: token.colorPrimary }} />
                  <div style={{ textAlign: 'left' }}>
                    <Text strong style={{ fontSize: 13, display: 'block', lineHeight: 1.2 }}>
                      {user?.name}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {user?.employee_code}
                    </Text>
                  </div>
                </Space>
              </Button>
            </Dropdown>
          </Space>
        </Header>

        <Content
          style={{
            margin: '24px',
            padding: '0',
            minHeight: 280,
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};
