import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeaveService, AppError } from '../../src/services/leave.service.js';
import { leaveTypesRepository } from '../../src/repositories/leaveTypes.repository.js';
import { holidayService } from '../../src/services/holiday.service.js';
import { leaveRequestsRepository } from '../../src/repositories/leaveRequests.repository.js';
import { leaveBalancesRepository } from '../../src/repositories/leaveBalances.repository.js';
import * as dbModule from '../../src/lib/db.js';
import { ErrorCode } from '@workforce/shared';

describe('Server-Side LeaveService Balance & Date Validation Tests', () => {
  let leaveService: LeaveService;

  beforeEach(() => {
    vi.clearAllMocks();
    leaveService = new LeaveService();

    // Mock withTransaction to execute the callback directly
    vi.spyOn(dbModule, 'withTransaction').mockImplementation(async (cb: any) => {
      return cb({} as any);
    });
  });

  it('rejects leave when end_date is before start_date', async () => {
    await expect(
      leaveService.applyLeave(
        'user-1',
        { company_id: 'comp-1', office_id: 'off-1' },
        {
          leave_type_id: 'lt-1',
          start_date: '2026-10-15',
          end_date: '2026-10-10',
        }
      )
    ).rejects.toThrow('end_date must be on or after start_date');
  });

  it('rejects leave spanning multiple calendar years', async () => {
    await expect(
      leaveService.applyLeave(
        'user-1',
        { company_id: 'comp-1', office_id: 'off-1' },
        {
          leave_type_id: 'lt-1',
          start_date: '2026-12-28',
          end_date: '2027-01-04',
        }
      )
    ).rejects.toThrow('Leave requests cannot span across multiple calendar years');
  });

  it('rejects leave when requested working days exceed available balance', async () => {
    // 1. Leave type exists and active
    vi.spyOn(leaveTypesRepository, 'findById').mockResolvedValue({
      id: 'lt-1',
      company_id: 'comp-1',
      name: 'Casual Leave',
      annual_quota: 12,
      is_paid: false,
      is_active: true,
    } as any);

    // 2. Holiday data: no holidays
    vi.spyOn(holidayService, 'fetchCalendarData').mockResolvedValue({
      holidays: [],
      weeklyRules: [{ id: 'w1', company_id: 'comp-1', day_of_week: 0, week_of_month: null, is_active: true } as any],
    });

    // 3. No overlap
    vi.spyOn(leaveRequestsRepository, 'hasOverlap').mockResolvedValue(false);

    // 4. Balance: allocated 12, used 9, pending 0 -> available = 3
    vi.spyOn(leaveBalancesRepository, 'lockForUpdate').mockResolvedValue({
      id: 'bal-1',
      user_id: 'user-1',
      leave_type_id: 'lt-1',
      leave_year: 2026,
      allocated_days: 12,
      used_days: 9,
      pending_days: 0,
    } as any);

    // 5. Apply for 5 working days: 29 Oct 2026 to 03 Nov 2026
    // 29 Oct (Thu), 30 Oct (Fri), 31 Oct (Sat), 01 Nov (Sun - non-working), 02 Nov (Mon), 03 Nov (Tue) = 5 working days
    await expect(
      leaveService.applyLeave(
        'user-1',
        { company_id: 'comp-1', office_id: 'off-1' },
        {
          leave_type_id: 'lt-1',
          start_date: '2026-10-29',
          end_date: '2026-11-03',
        }
      )
    ).rejects.toThrow(/Insufficient leave balance\. Requested: 5 day\(s\), Available: 3\.00 day\(s\)/);
  });
});
