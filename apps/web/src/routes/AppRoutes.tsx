import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout.js';
import { ProtectedRoute } from '../components/common/ProtectedRoute.js';
import { LoginPage } from '../pages/auth/LoginPage.js';
import { EmployeeDashboard } from '../pages/employee/EmployeeDashboard.js';
import { CheckInPage } from '../pages/employee/CheckInPage.js';
import { CheckOutPage } from '../pages/employee/CheckOutPage.js';
import { AttendanceHistoryPage } from '../pages/employee/AttendanceHistoryPage.js';
import { SelfEnrollmentPage } from '../pages/employee/SelfEnrollmentPage.js';
import { AdminDashboard } from '../pages/admin/AdminDashboard.js';
import { UsersPage } from '../pages/admin/UsersPage.js';
import { FaceEnrollmentPage } from '../pages/admin/FaceEnrollmentPage.js';
import { OfficesPage } from '../pages/admin/OfficesPage.js';
import { DepartmentsPage } from '../pages/admin/DepartmentsPage.js';
import { RolesPage } from '../pages/admin/RolesPage.js';
import { ReportsPage } from '../pages/admin/ReportsPage.js';
import { AuditLogsPage } from '../pages/admin/AuditLogsPage.js';
import { PermissionKey } from '@workforce/shared';
import { useAuth } from '../context/AuthContext.js';

export const AppRoutes: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/employee/dashboard" replace /> : <LoginPage />}
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/employee/dashboard" replace />} />

        {/* Employee Self Service */}
        <Route path="employee/dashboard" element={<EmployeeDashboard />} />
        <Route path="employee/face-enrollment" element={<SelfEnrollmentPage />} />
        <Route
          path="employee/attendance/check-in"
          element={
            <ProtectedRoute permission={PermissionKey.ATTENDANCE_CHECKIN}>
              <CheckInPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="employee/attendance/check-out"
          element={
            <ProtectedRoute permission={PermissionKey.ATTENDANCE_CHECKOUT}>
              <CheckOutPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="employee/attendance"
          element={
            <ProtectedRoute permission={PermissionKey.ATTENDANCE_READ}>
              <AttendanceHistoryPage />
            </ProtectedRoute>
          }
        />

        {/* Admin / Workforce Management */}
        <Route
          path="admin/dashboard"
          element={
            <ProtectedRoute permission={PermissionKey.REPORTS_READ}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/users"
          element={
            <ProtectedRoute permission={PermissionKey.USER_READ}>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/users/:id/face-enrollment"
          element={
            <ProtectedRoute permission={PermissionKey.FACE_ENROLL}>
              <FaceEnrollmentPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/offices"
          element={
            <ProtectedRoute permission={PermissionKey.OFFICE_READ}>
              <OfficesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/departments"
          element={
            <ProtectedRoute permission={PermissionKey.DEPARTMENT_READ}>
              <DepartmentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/roles"
          element={
            <ProtectedRoute permission={PermissionKey.ROLE_READ}>
              <RolesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/reports"
          element={
            <ProtectedRoute permission={PermissionKey.REPORTS_READ}>
              <ReportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/audit-logs"
          element={
            <ProtectedRoute permission={PermissionKey.AUDIT_READ}>
              <AuditLogsPage />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
