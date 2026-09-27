import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { EmployeeDashboard } from '../../src/pages/employee/EmployeeDashboard.js';
import * as AuthContextModule from '../../src/context/AuthContext.js';
import { api } from '../../src/services/api.js';

describe('EmployeeDashboard Component Tests', () => {
  const mockUser: any = {
    id: 'emp-101-uuid',
    name: 'Alex Mercer',
    employee_code: 'EMP-101',
    office_id: 'office-1-uuid',
    office_name: 'Tech Park HQ (San Francisco)',
    face_enrolled: true,
  };

  beforeEach(() => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      hasPermission: vi.fn().mockReturnValue(true),
      hasAnyPermission: vi.fn().mockReturnValue(true),
    });

    vi.spyOn(api, 'get').mockImplementation((url: string) => {
      if (url.includes('/attendance/active')) {
        return Promise.resolve({ data: { success: true, data: null } });
      }
      if (url.includes('/attendance/history')) {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      if (url.includes('/offices/')) {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              id: 'office-1-uuid',
              name: 'Tech Park HQ (San Francisco)',
              latitude: 37.774929,
              longitude: -122.419416,
              radius_meters: 200,
            },
          },
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
  });

  it('renders employee identity and check in button when not checked in', async () => {
    render(
      <MemoryRouter>
        <EmployeeDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Welcome, Alex Mercer/i)).toBeInTheDocument();
      expect(screen.getByText('EMP-101')).toBeInTheDocument();
      expect(screen.getByText(/CHECK IN NOW/i)).toBeInTheDocument();
      expect(screen.getByText(/Biometric Face Enrolled/i)).toBeInTheDocument();
    });
  });
});
