import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import dayjs from 'dayjs';
import { LeavePage } from '../../src/pages/employee/LeavePage.js';
import * as AuthContextModule from '../../src/context/AuthContext.js';
import * as LeaveApiModule from '../../src/services/leave.api.js';
import * as HolidaysApiModule from '../../src/services/holidays.api.js';

// Mock ResponsiveDateRangePicker to reliably trigger date selection in tests
vi.mock('../../src/components/common/ResponsiveDateRangePicker.js', () => ({
  ResponsiveDateRangePicker: ({ onChange }: any) => (
    <div data-testid="mock-range-picker">
      <button
        type="button"
        data-testid="select-exceeding-dates"
        onClick={() => onChange([dayjs('2026-10-18'), dayjs('2026-11-01')])}
      >
        Select Exceeding Dates
      </button>
      <button
        type="button"
        data-testid="select-valid-dates"
        onClick={() => onChange([dayjs('2026-10-19'), dayjs('2026-10-20')])}
      >
        Select Valid Dates
      </button>
    </div>
  ),
}));

describe('LeavePage Component - Balance Enforcement & Working Days Sync Tests', () => {
  const mockBalances = [
    {
      id: 'bal-1',
      user_id: 'user-1',
      leave_type_id: 'lt-casual',
      leave_year: dayjs().year(),
      allocated_days: 12,
      used_days: 0,
      pending_days: 0,
      remaining_days: 12,
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

    vi.spyOn(HolidaysApiModule, 'getWorkingDays').mockImplementation(async (start_date: string, end_date: string) => {
      // If user selected 18 Oct to 01 Nov (15 days), server returns 15 working days
      if (start_date === '2026-10-18' && end_date === '2026-11-01') {
        return {
          data: { success: true, data: { working_days: 15, start_date, end_date } },
        } as any;
      }
      return {
        data: { success: true, data: { working_days: 2, start_date, end_date } },
      } as any;
    });
  });

  it('renders leave balances correctly with remaining days', async () => {
    render(<LeavePage />);

    await waitFor(() => {
      expect(screen.getByText('My Leave')).toBeInTheDocument();
      expect(screen.getByText('Casual Leave')).toBeInTheDocument();
      expect(screen.getByText('12 left')).toBeInTheDocument();
      expect(screen.getByText('Sick Leave')).toBeInTheDocument();
      expect(screen.getByText('8 left')).toBeInTheDocument();
    });
  });

  it('disables submit button and displays over-limit warning when requested working days exceed available balance', async () => {
    const applySpy = vi.spyOn(LeaveApiModule, 'applyLeave').mockResolvedValue({} as any);

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

    // Select Leave Type: Casual Leave (available: 12 days)
    const modal = document.querySelector('.ant-modal')!;
    const selectSelector = modal.querySelector('.ant-select-selector')!;
    fireEvent.mouseDown(selectSelector);

    const casualOption = await screen.findByText(/Casual Leave \(12 days\/year\)/);
    fireEvent.click(casualOption);

    // Initial state before dates: button is disabled because no dates selected
    expect(screen.getByRole('button', { name: /Submit Application/i })).toBeDisabled();

    // Select exceeding date range: 18 Oct to 01 Nov (15 working days requested vs 12 available = 3 days over limit)
    fireEvent.click(screen.getByTestId('select-exceeding-dates'));

    // Wait for getWorkingDays promise and state update
    await waitFor(() => {
      expect(screen.getByText(/Insufficient balance:/i)).toBeInTheDocument();
      expect(screen.getByText(/15d requested/i)).toBeInTheDocument();
      expect(screen.getByText(/3\.0d over limit/i)).toBeInTheDocument();
      expect(screen.getByText(/12\.0d available/i)).toBeInTheDocument();
    });

    // Submit button should be disabled with clear warning message
    const submitBtn = screen.getByRole('button', { name: /Cannot Submit \(Exceeds by 3\.0d\)/i });
    expect(submitBtn).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();

    // Attempting to click disabled button must NOT invoke applyLeave API
    fireEvent.click(submitBtn);
    expect(applySpy).not.toHaveBeenCalled();
  });

  it('enables submit button when requested working days are within available balance', async () => {
    render(<LeavePage />);

    await waitFor(() => {
      expect(screen.getByText('Apply for Leave')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Apply for Leave'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Submit Application/i })).toBeInTheDocument();
    });

    // Select Leave Type: Casual Leave (12 days available)
    const modal = document.querySelector('.ant-modal')!;
    const selectSelector = modal.querySelector('.ant-select-selector')!;
    fireEvent.mouseDown(selectSelector);

    const casualOption = await screen.findByText(/Casual Leave \(12 days\/year\)/);
    fireEvent.click(casualOption);

    // Select valid date range: 2 working days
    fireEvent.click(screen.getByTestId('select-valid-dates'));

    await waitFor(() => {
      expect(screen.getByText(/2 days requested/i)).toBeInTheDocument();
      expect(screen.getByText(/10\.0d remaining/i)).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /Submit Application/i });
    expect(submitBtn).toBeEnabled();
  });
});

