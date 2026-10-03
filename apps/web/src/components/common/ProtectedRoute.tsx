import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spin, Result, Button } from 'antd';
import { PermissionKey } from '@workforce/shared';
import { useAuth } from '../../context/AuthContext.js';

interface ProtectedRouteProps {
  children: React.ReactNode;
  permission?: PermissionKey;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, permission }) => {
  const { user, isAuthenticated, loading, hasPermission } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', gap: 12 }}>
        <Spin size="large" />
        <span style={{ color: '#8c8c8c', fontSize: 13 }}>Verifying credentials...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If user has no company, redirect to /onboarding unless already there
  if (!user?.company_id && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  // If user already belongs to a company and tries to visit /onboarding, redirect to dashboard
  if (user?.company_id && location.pathname === '/onboarding') {
    return <Navigate to="/employee/dashboard" replace />;
  }

  if (permission && !hasPermission(permission)) {
    return (
      <Result
        status="403"
        title="403 Forbidden"
        subTitle="Sorry, your role does not have permission to access this workforce module."
        extra={
          <Button type="primary" onClick={() => window.history.back()}>
            Go Back
          </Button>
        }
      />
    );
  }

  return <>{children}</>;
};
