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
      if (url.includes('/shifts/current')) {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              id: 'shift-1-uuid',
              name: 'Standard 8-Hour Shift',
              total_hours: 8,
              start_time: '09:00',
              end_time: '17:00',
              breaks: [
                {
                  name: 'Lunch Break',
                  start_time: '13:00',
                  end_time: '14:00',
                  duration_minutes: 60,
                  is_paid: false,
                },
              ],
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

  it('renders logged in work hours and office shift schedule instead of distance', async () => {
    render(
      <MemoryRouter>
        <EmployeeDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      // Check that "Logged In" label is rendered
      expect(screen.getByText('Logged In')).toBeInTheDocument();
      // Check that shift target is rendered
      expect(screen.getByText('/ 8h')).toBeInTheDocument();
      expect(screen.getByText(/Shift: 8h/i)).toBeInTheDocument();
      // Check that scheduled breaks are displayed
      expect(screen.getByText(/Lunch Break/i)).toBeInTheDocument();
      // Ensure "m from office" distance is NOT displayed in metrics
      expect(screen.queryByText(/from office/i)).not.toBeInTheDocument();
    });
  });
});
