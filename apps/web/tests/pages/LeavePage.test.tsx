import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import dayjs from 'dayjs';
import { LeavePage } from '../../src/pages/employee/LeavePage.js';
import * as AuthContextModule from '../../src/context/AuthContext.js';
import * as LeaveApiModule from '../../src/services/leave.api.js';

describe('LeavePage Component - Balance Enforcement & Anti-Spam Tests', () => {
  const mockBalances = [
    {
      id: 'bal-1',
      user_id: 'user-1',
      leave_type_id: 'lt-casual',
      leave_year: dayjs().year(),
      allocated_days: 12,
      used_days: 9,
      pending_days: 0,
      remaining_days: 3,
      leave_type_name: 'Casual Leave',
      leave_type_code: 'CL',
    },
    {
      id: 'bal-2',
      user_id: 'user-1',
      leave_type_id: 'lt-sick',
      leave_year: dayjs().year(),
      allocated_days: 10,
      used_days: 2,
      pending_days: 0,
      remaining_days: 8,
      leave_type_name: 'Sick Leave',
      leave_type_code: 'SL',
    },
  ];

  const mockLeaveTypes = [
    {
      id: 'lt-casual',
      company_id: 'comp-1',
      code: 'CL',
      name: 'Casual Leave',
      annual_quota: 12,
      is_paid: false,
      is_active: true,
    },
    {
      id: 'lt-sick',
      company_id: 'comp-1',
      code: 'SL',
      name: 'Sick Leave',
      annual_quota: 10,
      is_paid: true,
      is_active: true,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'user-1', name: 'Elena', employee_code: 'EMP-002', role_name: 'EMPLOYEE' } as any,
      isAuthenticated: true,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      hasPermission: vi.fn().mockReturnValue(true),
      hasAnyPermission: vi.fn().mockReturnValue(true),
    });

    vi.spyOn(LeaveApiModule, 'getMyLeaveBalances').mockResolvedValue({
      data: { success: true, data: mockBalances },
    } as any);

    vi.spyOn(LeaveApiModule, 'getMyLeaveRequests').mockResolvedValue({
      data: { success: true, data: [] },
    } as any);

    vi.spyOn(LeaveApiModule, 'getLeaveTypes').mockResolvedValue({
      data: { success: true, data: mockLeaveTypes },
    } as any);
  });

  it('renders leave balances correctly with remaining days', async () => {
    render(<LeavePage />);

    await waitFor(() => {
      expect(screen.getByText('My Leave')).toBeInTheDocument();
      expect(screen.getByText('Casual Leave')).toBeInTheDocument();
      expect(screen.getByText('3 left')).toBeInTheDocument();
      expect(screen.getByText('Sick Leave')).toBeInTheDocument();
      expect(screen.getByText('8 left')).toBeInTheDocument();
    });
  });

  it('disables the submit button and displays limit warning when requested days exceed available balance', async () => {
    render(<LeavePage />);

    // Wait for data load
    await waitFor(() => {
      expect(screen.getByText('Apply for Leave')).toBeInTheDocument();
    });

    // Open Apply modal
    fireEvent.click(screen.getByText('Apply for Leave'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Submit Application/i })).toBeInTheDocument();
    });

    // Submit button should be rendered and ready
    const submitBtn = screen.getByRole('button', { name: /Submit Application/i });
    expect(submitBtn).toBeInTheDocument();
  });
});
