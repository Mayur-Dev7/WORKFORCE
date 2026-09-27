import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PermissionGate } from '../../src/components/common/PermissionGate.js';
import * as AuthContextModule from '../../src/context/AuthContext.js';
import { PermissionKey, RoleName } from '@workforce/shared';

describe('PermissionGate Component Tests', () => {
  const mockUser: any = {
    id: '123',
    name: 'Elena Ramos',
    email: 'hr@workforce.com',
    role_name: RoleName.HR_ADMIN,
    permissions: [PermissionKey.USER_CREATE, PermissionKey.USER_READ],
  };

  it('renders children when user possesses required single permission', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      hasPermission: (p) => mockUser.permissions.includes(p),
      hasAnyPermission: (perms) => perms.some((p) => mockUser.permissions.includes(p)),
    });

    render(
      <PermissionGate permission={PermissionKey.USER_CREATE}>
        <div data-testid="allowed-content">Admin Create Button</div>
      </PermissionGate>
    );

    expect(screen.getByTestId('allowed-content')).toBeInTheDocument();
  });

  it('hides children when user lacks required permission', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      hasPermission: (p) => mockUser.permissions.includes(p),
      hasAnyPermission: (perms) => perms.some((p) => mockUser.permissions.includes(p)),
    });

    render(
      <PermissionGate
        permission={PermissionKey.OFFICE_CREATE}
        fallback={<div data-testid="fallback">No Access</div>}
      >
        <div data-testid="forbidden-content">Create Office Button</div>
      </PermissionGate>
    );

    expect(screen.queryByTestId('forbidden-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
  });
});
