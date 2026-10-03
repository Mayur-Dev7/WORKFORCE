/**
 * Sidebar.tsx
 * Apple-light enterprise sidebar for Workforce Access.
 *
 * Drop-in replacement for the inline sidebar rendering in AppLayout.tsx.
 * All routes, labels and permissions logic are preserved unchanged.
 */

import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Layout,
  Drawer,
  Tooltip,
  Avatar,
  Dropdown,
  Modal,
  message,
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
  ClockCircleOutlined,
  RightOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  ExportOutlined,
} from '@ant-design/icons';

import { useAuth } from '../context/AuthContext.js';
import { PermissionKey } from '@workforce/shared';
import styles from './Sidebar.module.css';

const { Sider } = Layout;

// ─── Types ──────────────────────────────────────────────────────────────────

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  path: string;
}

interface SidebarProps {
  collapsed: boolean;
  onCollapse: (c: boolean) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

// ─── Active-route helper ─────────────────────────────────────────────────────

function isItemActive(itemPath: string, currentPath: string): boolean {
  if (currentPath === itemPath) return true;
  // Attendance history should NOT activate when on check-in / check-out
  if (
    itemPath === '/employee/attendance' &&
    (currentPath.startsWith('/employee/attendance/check-in') ||
      currentPath.startsWith('/employee/attendance/check-out'))
  ) {
    return false;
  }
  return currentPath.startsWith(itemPath + '/');
}

// ─── Static nav data ─────────────────────────────────────────────────────────

const SELF_SERVICE: NavItem[] = [
  { key: '/employee/dashboard',          icon: <DashboardOutlined />,        label: 'Dashboard',        path: '/employee/dashboard'          },
  { key: '/employee/attendance',         icon: <HistoryOutlined />,           label: 'Attendance',       path: '/employee/attendance'         },
  { key: '/employee/leave',             icon: <CalendarOutlined />,           label: 'Leave',            path: '/employee/leave'              },
];

const BIOMETRIC: NavItem[] = [
  { key: '/employee/attendance/check-in',  icon: <CheckCircleOutlined />,   label: 'Face Check-In',    path: '/employee/attendance/check-in'  },
  { key: '/employee/attendance/check-out', icon: <CloseCircleOutlined />,   label: 'Face Check-Out',   path: '/employee/attendance/check-out' },
  { key: '/employee/face-enrollment',      icon: <IdcardOutlined />,         label: 'Face Registration',path: '/employee/face-enrollment'      },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Single navigation row (button). */
const NavRow: React.FC<{
  item: NavItem;
  collapsed: boolean;
  currentPath: string;
  onClick: () => void;
}> = ({ item, collapsed, currentPath, onClick }) => {
  const active = isItemActive(item.path, currentPath);
  const cls = [
    styles.item,
    collapsed ? styles.itemCollapsed : '',
    active    ? styles.itemActive   : '',
  ].filter(Boolean).join(' ');

  const button = (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
    >
      <span className={styles.icon}>{item.icon}</span>
      {!collapsed && <span className={styles.label}>{item.label}</span>}
    </button>
  );

  return collapsed ? (
    <Tooltip
      title={item.label}
      placement="right"
      mouseEnterDelay={0.1}
      overlayClassName="sb-tooltip"
    >
      {button}
    </Tooltip>
  ) : button;
};

/** Section heading (non-interactive). */
const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={styles.sectionLabel}>{children}</div>
);

// ─── Main sidebar content (shared between Sider and Drawer) ──────────────────

const SidebarContent: React.FC<{
  collapsed: boolean;
  onCollapse: (c: boolean) => void;
  onNav?: () => void;
}> = ({ collapsed, onCollapse, onNav }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, leaveCompany, hasPermission } = useAuth();

  const [adminExpanded, setAdminExpanded] = useState(() =>
    location.pathname.startsWith('/admin')
  );

  useEffect(() => {
    if (location.pathname.startsWith('/admin')) setAdminExpanded(true);
  }, [location.pathname]);

  const go = (path: string) => {
    navigate(path);
    onNav?.();
  };

  // ── Permission-gated admin items ───────────────────────────────────────────
  const adminItems: NavItem[] = [];
  if (hasPermission(PermissionKey.USER_READ))
    adminItems.push({ key: '/admin/users',      icon: <TeamOutlined />,             label: 'Employees',         path: '/admin/users'      });
  if (hasPermission(PermissionKey.OFFICE_READ))
    adminItems.push({ key: '/admin/offices',    icon: <EnvironmentOutlined />,      label: 'Office Geofences',  path: '/admin/offices'    });
  if (hasPermission(PermissionKey.SHIFT_READ))
    adminItems.push({ key: '/admin/shifts',     icon: <ClockCircleOutlined />,      label: 'Work Shifts & Breaks', path: '/admin/shifts' });
  if (hasPermission(PermissionKey.HOLIDAY_READ))
    adminItems.push({ key: '/admin/holidays',   icon: <CalendarOutlined />,         label: 'Holidays',          path: '/admin/holidays'   });
  if (hasPermission(PermissionKey.REPORTS_READ))
    adminItems.push({ key: '/admin/dashboard',  icon: <DashboardOutlined />,        label: 'Admin Overview',    path: '/admin/dashboard'  });
  if (hasPermission(PermissionKey.DEPARTMENT_READ))
    adminItems.push({ key: '/admin/departments',icon: <AppstoreOutlined />,         label: 'Departments',       path: '/admin/departments'});
  if (hasPermission(PermissionKey.ROLE_READ))
    adminItems.push({ key: '/admin/roles',      icon: <SafetyCertificateOutlined />, label: 'Roles & RBAC',     path: '/admin/roles'      });
  if (hasPermission(PermissionKey.REPORTS_READ))
    adminItems.push({ key: '/admin/reports',    icon: <BarChartOutlined />,         label: 'Reports',           path: '/admin/reports'    });
  if (hasPermission(PermissionKey.AUDIT_READ))
    adminItems.push({ key: '/admin/audit-logs', icon: <FileProtectOutlined />,      label: 'Audit Trail',       path: '/admin/audit-logs' });
  if (hasPermission(PermissionKey.LEAVE_READ_TEAM))
    adminItems.push({ key: '/admin/leave',      icon: <CalendarOutlined />,         label: 'Leave Management',  path: '/admin/leave'      });
  if (hasPermission(PermissionKey.ROLE_READ) || user?.role_name === 'COMPANY_ADMIN')
    adminItems.push({ key: '/admin/company-settings', icon: <SettingOutlined />,   label: 'Company Settings',  path: '/admin/company-settings' });

  // ── Dropdown for user chip ─────────────────────────────────────────────────
  const userMenu: MenuProps['items'] = [
    {
      key: 'info',
      label: (
        <div style={{ padding: '4px 0', lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#1d1d1f' }}>{user?.name}</div>
          <div style={{ fontSize: 12, color: '#6e6e73' }}>{user?.email}</div>
        </div>
      ),
      disabled: true,
    },
    { type: 'divider' },
    {
      key: 'leave_company',
      icon: <ExportOutlined />,
      label: 'Leave Company',
      onClick: () => {
        Modal.confirm({
          title: 'Leave Company',
          content: 'Are you sure you want to leave your company? Pending leaves will be canceled, active sessions closed, and face enrollment removed.',
          okText: 'Yes, Leave',
          okType: 'danger',
          onOk: async () => {
            try {
              if (leaveCompany) {
                await leaveCompany();
              }
              message.success('You have left the company.');
              navigate('/onboarding');
            } catch (err: any) {
              message.error(err.response?.data?.error?.message || 'Failed to leave company');
            }
          },
        });
      },
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Sign Out',
      danger: true,
      onClick: async () => { await logout(); navigate('/login'); },
    },
  ];

  const initial = user?.name ? user.name.charAt(0).toUpperCase() : '?';

  return (
    <>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className={`${styles.header} ${collapsed ? styles.headerCollapsed : ''}`}>
        <div className={styles.logoIcon}>
          <IdcardOutlined />
        </div>
        {!collapsed && (
          <div className={styles.brandText}>
            <span className={styles.brandTitle}>Workforce Access</span>
            <span className={styles.brandSubtitle}>Enterprise Portal</span>
          </div>
        )}
      </div>

      {/* ── Scrollable Nav ──────────────────────────────────────────────── */}
      <nav className={styles.nav} aria-label="Sidebar Navigation">

        {/* SELF SERVICE */}
        <div className={styles.group}>
          {!collapsed && <SectionLabel>Self Service</SectionLabel>}
          <div className={styles.groupItems}>
            {SELF_SERVICE.map((item) => (
              <NavRow
                key={item.key}
                item={item}
                collapsed={collapsed}
                currentPath={location.pathname}
                onClick={() => go(item.path)}
              />
            ))}
          </div>
        </div>

        {/* BIOMETRIC */}
        <div className={styles.group}>
          {!collapsed && <SectionLabel>Biometric</SectionLabel>}
          {collapsed && <div className={styles.railSpacer} />}
          <div className={styles.groupItems}>
            {BIOMETRIC.map((item) => (
              <NavRow
                key={item.key}
                item={item}
                collapsed={collapsed}
                currentPath={location.pathname}
                onClick={() => go(item.path)}
              />
            ))}
          </div>
        </div>

        {/* ADMINISTRATION — collapsible */}
        {adminItems.length > 0 && (
          <div className={styles.group}>
            {collapsed ? (
              <>
                <div className={styles.railSpacer} />
                <div className={styles.groupItems}>
                  {adminItems.map((item) => (
                    <NavRow
                      key={item.key}
                      item={item}
                      collapsed={collapsed}
                      currentPath={location.pathname}
                      onClick={() => go(item.path)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={styles.adminToggle}
                  onClick={() => setAdminExpanded((p) => !p)}
                  aria-expanded={adminExpanded}
                  aria-controls="admin-nav-items"
                >
                  Administration
                  <span className={styles.badge}>{adminItems.length}</span>
                  <RightOutlined
                    className={`${styles.adminChevron} ${adminExpanded ? styles.adminChevronOpen : ''}`}
                  />
                </button>

                {adminExpanded && (
                  <div id="admin-nav-items" className={styles.adminItems}>
                    {adminItems.map((item) => (
                      <NavRow
                        key={item.key}
                        item={item}
                        collapsed={false}
                        currentPath={location.pathname}
                        onClick={() => go(item.path)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </nav>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className={`${styles.footer} ${collapsed ? styles.footerCollapsed : ''}`}>

        {/* User chip */}
        <Dropdown menu={{ items: userMenu }} placement="topLeft" trigger={['click']}>
          <button
            type="button"
            className={`${styles.userChip} ${collapsed ? styles.userChipCollapsed : ''}`}
            aria-label={`Account menu for ${user?.name ?? 'user'}`}
          >
            <div className={styles.userAvatar}>
              {user?.name ? initial : <UserOutlined />}
            </div>
            {!collapsed && (
              <div className={styles.userInfo}>
                <span className={styles.userName}>{user?.name ?? '—'}</span>
                <span className={styles.userRole}>{user?.employee_code ?? ''}</span>
              </div>
            )}
          </button>
        </Dropdown>

        {/* Collapse / Expand */}
        {collapsed ? (
          <Tooltip title="Expand Sidebar" placement="right" mouseEnterDelay={0.1} overlayClassName="sb-tooltip">
            <button
              type="button"
              className={`${styles.collapseBtn} ${styles.collapseBtnCollapsed}`}
              onClick={() => onCollapse(false)}
              aria-label="Expand Sidebar"
            >
              <MenuUnfoldOutlined style={{ fontSize: 15 }} />
            </button>
          </Tooltip>
        ) : (
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={() => onCollapse(true)}
            aria-label="Collapse Sidebar"
          >
            <MenuFoldOutlined style={{ fontSize: 15 }} />
            <span>Collapse Sidebar</span>
          </button>
        )}
      </div>
    </>
  );
};

// ─── Main export ─────────────────────────────────────────────────────────────

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onCollapse,
  mobileOpen,
  onMobileClose,
}) => (
  <>
    {/* ── Desktop persistent sidebar ──────────────────────────────────────── */}
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={onCollapse}
      collapsedWidth={72}
      trigger={null}
      theme="light"
      width={260}
      className={`app-sider-desktop ${styles.sider}`}
    >
      <SidebarContent collapsed={collapsed} onCollapse={onCollapse} />
    </Sider>

    {/* ── Mobile overlay drawer ────────────────────────────────────────────── */}
    <Drawer
      placement="left"
      open={mobileOpen}
      onClose={onMobileClose}
      width={260}
      styles={{
        body: {
          padding: 0,
          background: 'var(--sb-surface-solid)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        },
        header: { display: 'none' },
        mask: { backdropFilter: 'blur(6px)', background: 'rgba(0,0,0,0.15)' },
      }}
      className="app-sider-mobile-drawer"
    >
      <SidebarContent collapsed={false} onCollapse={onCollapse} onNav={onMobileClose} />
    </Drawer>
  </>
);
