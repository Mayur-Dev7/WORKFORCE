import React from 'react';
import { PermissionKey } from '@workforce/shared';
import { useAuth } from '../../context/AuthContext.js';

interface PermissionGateProps {
  permission?: PermissionKey;
  permissions?: PermissionKey[];
  requireAll?: boolean;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const PermissionGate: React.FC<PermissionGateProps> = ({
  permission,
  permissions,
  requireAll = false,
  fallback = null,
  children,
}) => {
  const { hasPermission, hasAnyPermission, user } = useAuth();

  if (!user) {
    return <>{fallback}</>;
  }

  // Single permission check
  if (permission && !hasPermission(permission)) {
    return <>{fallback}</>;
  }

  // Multiple permissions check
  if (permissions && permissions.length > 0) {
    if (requireAll) {
      const allPassed = permissions.every((p) => hasPermission(p));
      if (!allPassed) return <>{fallback}</>;
    } else {
      const anyPassed = hasAnyPermission(permissions);
      if (!anyPassed) return <>{fallback}</>;
    }
  }

  return <>{children}</>;
};
