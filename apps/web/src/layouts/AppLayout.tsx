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
  Drawer,
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
  CalendarOutlined,
  MenuOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext.js';
import { PermissionKey } from '@workforce/shared';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

export const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    setMobileDrawerOpen(false);
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

  const buildMenuItems = (): MenuProps['items'] => {
    const items: MenuProps['items'] = [
      {
        key: 'group-employee',
        type: 'group',
        label: 'EMPLOYEE SELF SERVICE',
        children: [
          {
            key: '/employee/dashboard',
            icon: <DashboardOutlined />,
            label: 'Dashboard',
            onClick: () => handleNavigation('/employee/dashboard'),
          },
          {
            key: '/employee/attendance/check-in',
            icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
            label: 'Face Check-In',
            onClick: () => handleNavigation('/employee/attendance/check-in'),
          },
          {
            key: '/employee/attendance/check-out',
            icon: <CloseCircleOutlined style={{ color: '#fa8c16' }} />,
            label: 'Face Check-Out',
            onClick: () => handleNavigation('/employee/attendance/check-out'),
          },
          {
            key: '/employee/face-enrollment',
            icon: <IdcardOutlined style={{ color: '#1677ff' }} />,
            label: 'Face Registration',
            onClick: () => handleNavigation('/employee/face-enrollment'),
          },
          {
            key: '/employee/attendance',
            icon: <HistoryOutlined />,
            label: 'My Attendance',
            onClick: () => handleNavigation('/employee/attendance'),
          },
          {
            key: '/employee/leave',
            icon: <CalendarOutlined />,
            label: 'My Leave',
            onClick: () => handleNavigation('/employee/leave'),
          },
        ],
      },
    ];

    const canViewAdmin =
      hasPermission(PermissionKey.USER_READ) ||
      hasPermission(PermissionKey.OFFICE_READ) ||
      hasPermission(PermissionKey.REPORTS_READ) ||
      hasPermission(PermissionKey.LEAVE_READ_TEAM) ||
      hasPermission(PermissionKey.HOLIDAY_READ);

    if (canViewAdmin) {
      const adminChildren: any[] = [];

      if (hasPermission(PermissionKey.REPORTS_READ))
        adminChildren.push({ key: '/admin/dashboard', icon: <DashboardOutlined />, label: 'Admin Overview', onClick: () => handleNavigation('/admin/dashboard') });
      if (hasPermission(PermissionKey.USER_READ))
        adminChildren.push({ key: '/admin/users', icon: <TeamOutlined />, label: 'Employees', onClick: () => handleNavigation('/admin/users') });
      if (hasPermission(PermissionKey.OFFICE_READ))
        adminChildren.push({ key: '/admin/offices', icon: <EnvironmentOutlined />, label: 'Office Geofences', onClick: () => handleNavigation('/admin/offices') });
      if (hasPermission(PermissionKey.DEPARTMENT_READ))
        adminChildren.push({ key: '/admin/departments', icon: <AppstoreOutlined />, label: 'Departments', onClick: () => handleNavigation('/admin/departments') });
      if (hasPermission(PermissionKey.ROLE_READ))
        adminChildren.push({ key: '/admin/roles', icon: <SafetyCertificateOutlined />, label: 'Roles & RBAC', onClick: () => handleNavigation('/admin/roles') });
      if (hasPermission(PermissionKey.REPORTS_READ))
        adminChildren.push({ key: '/admin/reports', icon: <BarChartOutlined />, label: 'Reports & CSV', onClick: () => handleNavigation('/admin/reports') });
      if (hasPermission(PermissionKey.AUDIT_READ))
        adminChildren.push({ key: '/admin/audit-logs', icon: <FileProtectOutlined />, label: 'Audit Trail', onClick: () => handleNavigation('/admin/audit-logs') });
      if (hasPermission(PermissionKey.LEAVE_READ_TEAM))
        adminChildren.push({ key: '/admin/leave', icon: <CalendarOutlined />, label: 'Leave Management', onClick: () => handleNavigation('/admin/leave') });
      if (hasPermission(PermissionKey.HOLIDAY_READ))
        adminChildren.push({ key: '/admin/holidays', icon: <CalendarOutlined style={{ color: '#fa8c16' }} />, label: 'Holidays', onClick: () => handleNavigation('/admin/holidays') });

      if (adminChildren.length > 0) {
        items.push({ key: 'group-admin', type: 'group', label: 'ENTERPRISE ADMINISTRATION', children: adminChildren });
      }
    }
    return items;
  };

  const menuItems = buildMenuItems();

  const SidebarLogo = ({ showText }: { showText: boolean }) => (
    <div
      style={{
        height: 56,
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 10,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        flexShrink: 0,
      }}
    >
      <IdcardOutlined style={{ fontSize: 22, color: token.colorPrimary }} />
      {showText && (
        <div>
          <Text strong style={{ fontSize: 15 }}>Workforce Access</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 10 }}>Biometric + Geofence</Text>
        </div>
      )}
    </div>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Desktop Sidebar — hidden on mobile via CSS */}
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="light"
        width={240}
        className="app-sider-desktop"
        style={{
          borderRight: `1px solid ${token.colorBorderSecondary}`,
          overflow: 'auto',
          height: '100vh',
          position: 'sticky',
          top: 0,
          left: 0,
        }}
      >
        <SidebarLogo showText={!collapsed} />
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          defaultOpenKeys={['group-employee', 'group-admin']}
          items={menuItems}
          style={{ borderRight: 0 }}
        />
      </Sider>

      {/* Mobile Slide-in Drawer */}
      <Drawer
        placement="left"
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        width={260}
        styles={{ body: { padding: 0 }, header: { display: 'none' } }}
        className="app-sider-mobile-drawer"
      >
        <SidebarLogo showText={true} />
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          defaultOpenKeys={['group-employee', 'group-admin']}
          items={menuItems}
          style={{ borderRight: 0 }}
        />
      </Drawer>

      <Layout style={{ minWidth: 0 }}>
        {/* Top Header */}
        <Header
          style={{
            background: token.colorBgContainer,
            padding: '0 10px 0 6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            position: 'sticky',
            top: 0,
            zIndex: 100,
            height: 52,
            gap: 6,
          }}
        >
          {/* Mobile hamburger — hidden on desktop */}
          <Button
            type="text"
            icon={<MenuOutlined style={{ fontSize: 18 }} />}
            className="mobile-menu-trigger"
            onClick={() => setMobileDrawerOpen(true)}
          />

          <div style={{ display: 'flex', gap: 5, alignItems: 'center', flex: 1, overflow: 'hidden', minWidth: 0 }}>
            <Tag color="blue" style={{ margin: 0, fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.office_name || 'Office'}
            </Tag>
            <Tag color="purple" style={{ margin: 0, fontSize: 11 }} className="header-dept-tag">
              {user?.department_name || user?.role_name}
            </Tag>
          </div>

          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Button type="text" style={{ height: 'auto', padding: '4px 4px', flexShrink: 0 }}>
              <Space size={4}>
                <Avatar icon={<UserOutlined />} size={28} style={{ backgroundColor: token.colorPrimary }} />
                <div className="header-user-name">
                  <Text strong style={{ fontSize: 12, display: 'block', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                    {user?.name?.split(' ')[0]}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 10 }}>{user?.employee_code}</Text>
                </div>
              </Space>
            </Button>
          </Dropdown>
        </Header>

        <Content className="app-content">
          <Outlet />
        </Content>

        {/* Mobile Bottom Navigation — hidden on desktop */}
        <nav className="mobile-bottom-nav">
          <button
            className={`mob-nav-btn ${location.pathname === '/employee/dashboard' ? 'mob-active' : ''}`}
            onClick={() => navigate('/employee/dashboard')}
          >
            <DashboardOutlined />
            <span>Home</span>
          </button>
          <button
            className={`mob-nav-btn mob-checkin ${location.pathname === '/employee/attendance/check-in' ? 'mob-active' : ''}`}
            onClick={() => navigate('/employee/attendance/check-in')}
          >
            <CheckCircleOutlined />
            <span>Check In</span>
          </button>
          <button
            className={`mob-nav-btn mob-checkout ${location.pathname === '/employee/attendance/check-out' ? 'mob-active' : ''}`}
            onClick={() => navigate('/employee/attendance/check-out')}
          >
            <CloseCircleOutlined />
            <span>Check Out</span>
          </button>
          <button
            className={`mob-nav-btn ${location.pathname === '/employee/attendance' ? 'mob-active' : ''}`}
            onClick={() => navigate('/employee/attendance')}
          >
            <HistoryOutlined />
            <span>History</span>
          </button>
          <button
            className={`mob-nav-btn ${location.pathname.startsWith('/employee/leave') ? 'mob-active' : ''}`}
            onClick={() => navigate('/employee/leave')}
          >
            <CalendarOutlined />
            <span>Leave</span>
          </button>
        </nav>
      </Layout>
    </Layout>
  );
};
