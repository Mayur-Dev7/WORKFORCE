import React, { useState, useEffect } from 'react';
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
  Tooltip,
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
  ClockCircleOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext.js';
import { PermissionKey } from '@workforce/shared';
import dayjs from 'dayjs';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

export const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [adminExpanded, setAdminExpanded] = useState(() => location.pathname.startsWith('/admin'));
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();

  useEffect(() => {
    if (location.pathname.startsWith('/admin')) {
      setAdminExpanded(true);
    }
  }, [location.pathname]);

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
    if (pathname.startsWith('/admin/shifts')) return 'Work Shifts & Breaks';
    if (pathname.startsWith('/admin/leave')) return 'Leave Management';
    return 'Dashboard';
  };

  interface NavItem {
    key: string;
    label: string;
    icon: React.ReactNode;
    path: string;
  }

  const isItemActive = (itemPath: string, currentPath: string) => {
    if (currentPath === itemPath) return true;
    if (
      itemPath === '/employee/attendance' &&
      (currentPath.startsWith('/employee/attendance/check-in') ||
        currentPath.startsWith('/employee/attendance/check-out'))
    ) {
      return false;
    }
    return currentPath.startsWith(itemPath + '/');
  };

  const selfServiceItems: NavItem[] = [
    {
      key: '/employee/dashboard',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
      path: '/employee/dashboard',
    },
    {
      key: '/employee/attendance',
      icon: <HistoryOutlined />,
      label: 'Attendance',
      path: '/employee/attendance',
    },
    {
      key: '/employee/leave',
      icon: <CalendarOutlined />,
      label: 'Leave',
      path: '/employee/leave',
    },
  ];

  const biometricItems: NavItem[] = [
    {
      key: '/employee/attendance/check-in',
      icon: <CheckCircleOutlined />,
      label: 'Face Check-In',
      path: '/employee/attendance/check-in',
    },
    {
      key: '/employee/attendance/check-out',
      icon: <CloseCircleOutlined />,
      label: 'Face Check-Out',
      path: '/employee/attendance/check-out',
    },
    {
      key: '/employee/face-enrollment',
      icon: <IdcardOutlined />,
      label: 'Face Registration',
      path: '/employee/face-enrollment',
    },
  ];

  const adminItems: NavItem[] = [];
  if (hasPermission(PermissionKey.USER_READ))
    adminItems.push({ key: '/admin/users', icon: <TeamOutlined />, label: 'Employees', path: '/admin/users' });
  if (hasPermission(PermissionKey.OFFICE_READ))
    adminItems.push({ key: '/admin/offices', icon: <EnvironmentOutlined />, label: 'Office Geofences', path: '/admin/offices' });
  if (hasPermission(PermissionKey.SHIFT_READ))
    adminItems.push({ key: '/admin/shifts', icon: <ClockCircleOutlined />, label: 'Work Shifts & Breaks', path: '/admin/shifts' });
  if (hasPermission(PermissionKey.HOLIDAY_READ))
    adminItems.push({ key: '/admin/holidays', icon: <CalendarOutlined />, label: 'Holidays', path: '/admin/holidays' });
  if (hasPermission(PermissionKey.REPORTS_READ))
    adminItems.push({ key: '/admin/dashboard', icon: <DashboardOutlined />, label: 'Admin Overview', path: '/admin/dashboard' });
  if (hasPermission(PermissionKey.DEPARTMENT_READ))
    adminItems.push({ key: '/admin/departments', icon: <AppstoreOutlined />, label: 'Departments', path: '/admin/departments' });
  if (hasPermission(PermissionKey.ROLE_READ))
    adminItems.push({ key: '/admin/roles', icon: <SafetyCertificateOutlined />, label: 'Roles & RBAC', path: '/admin/roles' });
  if (hasPermission(PermissionKey.REPORTS_READ))
    adminItems.push({ key: '/admin/reports', icon: <BarChartOutlined />, label: 'Reports', path: '/admin/reports' });
  if (hasPermission(PermissionKey.AUDIT_READ))
    adminItems.push({ key: '/admin/audit-logs', icon: <FileProtectOutlined />, label: 'Audit Trail', path: '/admin/audit-logs' });
  if (hasPermission(PermissionKey.LEAVE_READ_TEAM))
    adminItems.push({ key: '/admin/leave', icon: <CalendarOutlined />, label: 'Leave Management', path: '/admin/leave' });

  const renderItem = (item: NavItem, isCollapsed: boolean, onNav?: () => void) => {
    const active = isItemActive(item.path, location.pathname);
    const buttonNode = (
      <button
        key={item.key}
        type="button"
        className={`apple-sidebar-item ${isCollapsed ? 'collapsed' : ''} ${active ? 'active' : ''}`}
        onClick={() => {
          handleNavigation(item.path);
          if (onNav) onNav();
        }}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
      >
        <span className="apple-sidebar-item-icon">{item.icon}</span>
        {!isCollapsed && (
          <span className="apple-sidebar-item-label">{item.label}</span>
        )}
      </button>
    );

    if (isCollapsed) {
      return (
        <Tooltip
          key={item.key}
          title={item.label}
          placement="right"
          mouseEnterDelay={0.1}
          overlayClassName="apple-sidebar-tooltip"
        >
          {buttonNode}
        </Tooltip>
      );
    }

    return buttonNode;
  };

  const renderSidebarHeader = (isCollapsed: boolean) => (
    <div className={`apple-sidebar-header ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="apple-sidebar-logo-icon">
        <IdcardOutlined />
      </div>
      {!isCollapsed && (
        <div className="apple-sidebar-brand-text">
          <span className="apple-sidebar-brand-title">Workforce Access</span>
          <span className="apple-sidebar-brand-subtitle">Enterprise Portal</span>
        </div>
      )}
    </div>
  );

  const renderNavContent = (isCollapsed: boolean, onNav?: () => void) => (
    <nav className="apple-sidebar-nav" aria-label="Sidebar Navigation">
      {/* SELF SERVICE */}
      <div className="apple-sidebar-group">
        {!isCollapsed && <div className="apple-sidebar-group-title">Self Service</div>}
        <div className="apple-sidebar-group-items">
          {selfServiceItems.map((item) => renderItem(item, isCollapsed, onNav))}
        </div>
      </div>

      {isCollapsed && <div className="apple-sidebar-rail-space" />}

      {/* BIOMETRIC */}
      <div className="apple-sidebar-group">
        {!isCollapsed && <div className="apple-sidebar-group-title">Biometric</div>}
        <div className="apple-sidebar-group-items">
          {biometricItems.map((item) => renderItem(item, isCollapsed, onNav))}
        </div>
      </div>

      {/* ADMINISTRATION (COLLAPSIBLE SECONDARY WORKSPACE) */}
      {adminItems.length > 0 && (
        <>
          {isCollapsed ? (
            <>
              <div className="apple-sidebar-rail-space" />
              <div className="apple-sidebar-group">
                <div className="apple-sidebar-group-items">
                  {adminItems.map((item) => renderItem(item, isCollapsed, onNav))}
                </div>
              </div>
            </>
          ) : (
            <div className="apple-sidebar-group">
              <button
                type="button"
                className="apple-sidebar-section-toggle"
                onClick={() => setAdminExpanded((prev) => !prev)}
                aria-expanded={adminExpanded}
              >
                <span>Administration</span>
                <span className="apple-sidebar-section-badge">{adminItems.length}</span>
                <RightOutlined className={`apple-sidebar-chevron ${adminExpanded ? 'open' : 'closed'}`} />
              </button>
              {adminExpanded && (
                <div className="apple-sidebar-group-items">
                  {adminItems.map((item) => renderItem(item, isCollapsed, onNav))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </nav>
  );

  const renderSidebarFooter = (isCollapsed: boolean) => (
    <div className={`apple-sidebar-footer ${isCollapsed ? 'collapsed' : ''}`}>
      {isCollapsed ? (
        <Tooltip title="Expand Sidebar" placement="right" mouseEnterDelay={0.1} overlayClassName="apple-sidebar-tooltip">
          <button
            type="button"
            className="apple-sidebar-collapse-btn collapsed"
            onClick={() => setCollapsed(false)}
            aria-label="Expand Sidebar"
          >
            <RightOutlined style={{ fontSize: 11 }} />
          </button>
        </Tooltip>
      ) : (
        <button
          type="button"
          className="apple-sidebar-collapse-btn"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse Sidebar"
        >
          <LeftOutlined style={{ fontSize: 11 }} />
          <span>Collapse Sidebar</span>
        </button>
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
        collapsedWidth={64}
        trigger={null}
        theme="light"
        width={240}
        className="app-sider-desktop apple-sider"
      >
        {renderSidebarHeader(collapsed)}
        {renderNavContent(collapsed)}
        {renderSidebarFooter(collapsed)}
      </Sider>

      {/* Mobile Slide-in Drawer */}
      <Drawer
        placement="left"
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        width={250}
        styles={{
          body: {
            padding: 0,
            background: 'var(--sidebar-surface)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          },
          header: { display: 'none' },
        }}
        className="app-sider-mobile-drawer"
      >
        {renderSidebarHeader(false)}
        {renderNavContent(false, () => setMobileDrawerOpen(false))}
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

          {/* Left: Section Title or Current Date */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 0 }}>
            {location.pathname === '/employee/dashboard' ? (
              <>
                <span className="apple-header-date">
                  {dayjs().format('dddd, MMMM D')}
                </span>
                <span className="mobile-only" style={{ fontSize: 15, fontWeight: 600, color: 'var(--apple-text-primary)', letterSpacing: '-0.2px', whiteSpace: 'nowrap' }}>
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
            className={`mob-nav-btn ${location.pathname.startsWith('/employee/attendance/check-in') || location.pathname.startsWith('/employee/attendance/check-out') ? 'mob-active' : ''}`}
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
