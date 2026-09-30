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

  const getPageTitle = (pathname: string) => {
    if (pathname === '/employee/dashboard') return 'Dashboard';
    if (pathname === '/employee/attendance') return 'Attendance';
    if (pathname.startsWith('/employee/attendance/check-in')) return 'Face Check-In';
    if (pathname.startsWith('/employee/attendance/check-out')) return 'Face Check-Out';
    if (pathname.startsWith('/employee/face-enrollment')) return 'Face Registration';
    if (pathname.startsWith('/employee/leave')) return 'Leave';
    if (pathname === '/admin/dashboard') return 'Admin Overview';
    if (pathname.startsWith('/admin/users')) return 'Employees';
    if (pathname.startsWith('/admin/offices')) return 'Office Geofences';
    if (pathname.startsWith('/admin/holidays')) return 'Holidays';
    if (pathname.startsWith('/admin/departments')) return 'Departments';
    if (pathname.startsWith('/admin/roles')) return 'Roles & RBAC';
    if (pathname.startsWith('/admin/reports')) return 'Reports';
    if (pathname.startsWith('/admin/audit-logs')) return 'Audit Trail';
    return 'Dashboard';
  };

  const buildMenuItems = (): MenuProps['items'] => {
    const items: MenuProps['items'] = [
      {
        key: 'group-self-service',
        type: 'group',
        label: 'SELF SERVICE',
        children: [
          {
            key: '/employee/dashboard',
            icon: <DashboardOutlined />,
            label: 'Dashboard',
            onClick: () => handleNavigation('/employee/dashboard'),
          },
          {
            key: '/employee/attendance',
            icon: <HistoryOutlined />,
            label: 'Attendance',
            onClick: () => handleNavigation('/employee/attendance'),
          },
          {
            key: '/employee/leave',
            icon: <CalendarOutlined />,
            label: 'Leave',
            onClick: () => handleNavigation('/employee/leave'),
          },
        ],
      },
      {
        key: 'group-biometric',
        type: 'group',
        label: 'BIOMETRIC',
        children: [
          {
            key: '/employee/attendance/check-in',
            icon: <CheckCircleOutlined />,
            label: 'Face Check-In',
            onClick: () => handleNavigation('/employee/attendance/check-in'),
          },
          {
            key: '/employee/attendance/check-out',
            icon: <CloseCircleOutlined />,
            label: 'Face Check-Out',
            onClick: () => handleNavigation('/employee/attendance/check-out'),
          },
          {
            key: '/employee/face-enrollment',
            icon: <IdcardOutlined />,
            label: 'Face Registration',
            onClick: () => handleNavigation('/employee/face-enrollment'),
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

      if (hasPermission(PermissionKey.USER_READ))
        adminChildren.push({ key: '/admin/users', icon: <TeamOutlined />, label: 'Employees', onClick: () => handleNavigation('/admin/users') });
      if (hasPermission(PermissionKey.OFFICE_READ))
        adminChildren.push({ key: '/admin/offices', icon: <EnvironmentOutlined />, label: 'Office Geofences', onClick: () => handleNavigation('/admin/offices') });
      if (hasPermission(PermissionKey.HOLIDAY_READ))
        adminChildren.push({ key: '/admin/holidays', icon: <CalendarOutlined />, label: 'Holidays', onClick: () => handleNavigation('/admin/holidays') });
      if (hasPermission(PermissionKey.REPORTS_READ))
        adminChildren.push({ key: '/admin/dashboard', icon: <DashboardOutlined />, label: 'Admin Overview', onClick: () => handleNavigation('/admin/dashboard') });
      if (hasPermission(PermissionKey.DEPARTMENT_READ))
        adminChildren.push({ key: '/admin/departments', icon: <AppstoreOutlined />, label: 'Departments', onClick: () => handleNavigation('/admin/departments') });
      if (hasPermission(PermissionKey.ROLE_READ))
        adminChildren.push({ key: '/admin/roles', icon: <SafetyCertificateOutlined />, label: 'Roles & RBAC', onClick: () => handleNavigation('/admin/roles') });
      if (hasPermission(PermissionKey.REPORTS_READ))
        adminChildren.push({ key: '/admin/reports', icon: <BarChartOutlined />, label: 'Reports', onClick: () => handleNavigation('/admin/reports') });
      if (hasPermission(PermissionKey.AUDIT_READ))
        adminChildren.push({ key: '/admin/audit-logs', icon: <FileProtectOutlined />, label: 'Audit Trail', onClick: () => handleNavigation('/admin/audit-logs') });
      if (hasPermission(PermissionKey.LEAVE_READ_TEAM))
        adminChildren.push({ key: '/admin/leave', icon: <CalendarOutlined />, label: 'Leave Management', onClick: () => handleNavigation('/admin/leave') });

      if (adminChildren.length > 0) {
        items.push({ key: 'group-admin', type: 'group', label: 'ADMINISTRATION', children: adminChildren });
      }
    }
    return items;
  };

  const menuItems = buildMenuItems();

  const SidebarLogo = ({ showText }: { showText: boolean }) => (
    <div
      style={{
        height: 52,
        display: 'flex',
        alignItems: 'center',
        padding: '0 18px',
        gap: 10,
        borderBottom: '1px solid var(--apple-border)',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: 'var(--apple-accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          fontSize: 14,
        }}
      >
        <IdcardOutlined />
      </div>
      {showText && (
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--apple-text-primary)', lineHeight: 1.2, letterSpacing: '-0.2px' }}>
            Workforce Access
          </div>
          <div style={{ fontSize: 11, color: 'var(--apple-text-secondary)', letterSpacing: '-0.1px' }}>
            Enterprise Portal
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Layout className="apple-app-layout">
      {/* Desktop Sidebar — hidden on mobile via CSS */}
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="light"
        width={240}
        className="app-sider-desktop apple-sider"
        style={{
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
          defaultOpenKeys={['group-self-service', 'group-biometric', 'group-admin']}
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
          defaultOpenKeys={['group-self-service', 'group-biometric', 'group-admin']}
          items={menuItems}
          style={{ borderRight: 0 }}
        />
      </Drawer>

      <Layout style={{ minWidth: 0, background: 'var(--apple-bg)' }}>
        {/* Top Header / Toolbar */}
        <Header
          className="apple-header"
          style={{
            padding: '0 20px 0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 100,
            gap: 12,
          }}
        >
          {/* Mobile hamburger — hidden on desktop */}
          <Button
            type="text"
            icon={<MenuOutlined style={{ fontSize: 17 }} />}
            className="mobile-menu-trigger"
            onClick={() => setMobileDrawerOpen(true)}
            style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          />

          {/* Left: Current Page Title + Subtle Location Indicator */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 0 }}>
            <span className="apple-header-title">{getPageTitle(location.pathname)}</span>
            {user?.office_name && (
              <span className="apple-header-tag" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.office_name}
              </span>
            )}
          </div>

          {/* Right: Employee Profile Menu */}
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <button
              type="button"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: 8,
                transition: 'background-color 0.12s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <Avatar
                size={28}
                style={{
                  backgroundColor: '#e5e5ea',
                  color: 'var(--apple-text-primary)',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {user?.name ? user.name.charAt(0).toUpperCase() : <UserOutlined />}
              </Avatar>
              <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--apple-text-primary)', whiteSpace: 'nowrap' }}>
                  {user?.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--apple-text-secondary)', whiteSpace: 'nowrap' }}>
                  {user?.employee_code}
                </div>
              </div>
            </button>
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
