import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Layout,
  Avatar,
  Dropdown,
  Typography,
  Button,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  CheckCircleOutlined,
  HistoryOutlined,
  EnvironmentOutlined,
  UserOutlined,
  LogoutOutlined,
  CalendarOutlined,
  MenuOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext.js';
import dayjs from 'dayjs';
import { Sidebar } from './Sidebar.js';
import '../styles/sidebar.tokens.css';

const { Header, Content } = Layout;
const { Text } = Typography;

export const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

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
    if (pathname.startsWith('/admin/shifts')) return 'Work Shifts & Breaks';
    if (pathname.startsWith('/admin/leave')) return 'Leave Management';
    return 'Dashboard';
  };

  return (
    <Layout className="apple-app-layout">
      {/* ── Sidebar (desktop sider + mobile drawer) ──────────────────────── */}
      <Sidebar
        collapsed={collapsed}
        onCollapse={setCollapsed}
        mobileOpen={mobileDrawerOpen}
        onMobileClose={() => setMobileDrawerOpen(false)}
      />

      <Layout style={{ minWidth: 0, background: 'var(--apple-bg)' }}>
        {/* ── Top Header / Toolbar ─────────────────────────────────────────── */}
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

          {/* Left: Section Title or Current Date */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 0 }}>
            {location.pathname === '/employee/dashboard' ? (
              <>
                <span className="apple-header-date">
                  {dayjs().format('dddd, MMMM D')}
                </span>
                <span
                  className="mobile-only"
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: 'var(--apple-text-primary)',
                    letterSpacing: '-0.2px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Workforce Access
                </span>
              </>
            ) : (
              <span className="apple-header-title">{getPageTitle(location.pathname)}</span>
            )}
          </div>

          {/* Right: Assigned Office & Employee Profile Menu */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {user?.office_name && (
              <div
                className="apple-header-office"
                style={{
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 12,
                  color: 'var(--apple-text-secondary)',
                  background: 'rgba(0,0,0,0.03)',
                  padding: '3px 10px',
                  borderRadius: 9999,
                  border: '1px solid var(--apple-border-subtle)',
                  whiteSpace: 'nowrap',
                }}
                title={`Assigned Office: ${user.office_name}`}
              >
                <EnvironmentOutlined style={{ fontSize: 11, color: 'var(--apple-text-secondary)' }} />
                <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.office_name}
                </span>
              </div>
            )}

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
                  padding: '4px',
                  borderRadius: 8,
                  transition: 'background-color 0.12s ease',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <Avatar
                  size={30}
                  style={{
                    backgroundColor: '#e5e5ea',
                    color: 'var(--apple-text-primary)',
                    fontSize: 12.5,
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {user?.name ? user.name.charAt(0).toUpperCase() : <UserOutlined />}
                </Avatar>
                <div className="apple-header-profile-text" style={{ textAlign: 'left', lineHeight: 1.2 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--apple-text-primary)', whiteSpace: 'nowrap' }}>
                    {user?.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--apple-text-secondary)', whiteSpace: 'nowrap' }}>
                    {user?.employee_code}
                  </div>
                </div>
              </button>
            </Dropdown>
          </div>
        </Header>

        <Content className="app-content">
          <Outlet />
        </Content>

        {/* ── Mobile Bottom Navigation — hidden on desktop ──────────────── */}
        <nav className="mobile-bottom-nav">
          <button
            className={`mob-nav-btn ${location.pathname === '/employee/dashboard' ? 'mob-active' : ''}`}
            onClick={() => navigate('/employee/dashboard')}
          >
            <DashboardOutlined />
            <span>Home</span>
          </button>
          <button
            className={`mob-nav-btn ${
              location.pathname.startsWith('/employee/attendance/check-in') ||
              location.pathname.startsWith('/employee/attendance/check-out')
                ? 'mob-active'
                : ''
            }`}
            onClick={() => navigate('/employee/attendance/check-in')}
          >
            <CheckCircleOutlined />
            <span>Attendance</span>
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
          <button
            className={`mob-nav-btn ${location.pathname.startsWith('/employee/face-enrollment') ? 'mob-active' : ''}`}
            onClick={() => navigate('/employee/face-enrollment')}
          >
            <UserOutlined />
            <span>Profile</span>
          </button>
        </nav>
      </Layout>
    </Layout>
  );
};
