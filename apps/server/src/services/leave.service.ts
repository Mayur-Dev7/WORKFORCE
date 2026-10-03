/**
 * LeaveService
 *
 * Responsible for:
 *  - leave application (apply)
 *  - leave validation (dates, balance, overlap)
 *  - leave approval
 *  - leave rejection
 *  - leave cancellation
 *  - balance orchestration during state transitions
 *
 * Does NOT own balance data model — delegates to leaveBalancesRepository.
 * Working-day count is obtained from holidayService.
 */

import { withTransaction } from '../lib/db.js';
import { leaveRequestsRepository, LeaveRequestRow } from '../repositories/leaveRequests.repository.js';
import { leaveBalancesRepository } from '../repositories/leaveBalances.repository.js';
import { leaveTypesRepository } from '../repositories/leaveTypes.repository.js';
import { auditLogsRepository } from '../repositories/auditLogs.repository.js';
import { usersRepository } from '../repositories/users.repository.js';
import { holidayService } from './holiday.service.js';
import { countWorkingDays } from '../lib/calendar/holidayResolver.js';
import { AuditAction, ErrorCode } from '@workforce/shared';
import type { LeaveStatus } from '@workforce/shared';

export class AppError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 400) {
    super(message);
    this.name = 'AppError';
  }
}

export class LeaveService {
  // ─── Apply ─────────────────────────────────────────────────────────────────

  async applyLeave(
    actorUserId: string,
    /** company_id and office_id of the requesting user — needed for geofence-aware holiday resolution */
    userContext: { company_id: string; office_id: string },
    data: {
      leave_type_id: string;
      start_date: string; // YYYY-MM-DD
      end_date: string;   // YYYY-MM-DD
      reason?: string | null;
    }
  ): Promise<LeaveRequestRow> {
    const startDate = new Date(data.start_date + 'T00:00:00Z');
    const endDate = new Date(data.end_date + 'T00:00:00Z');

    if (endDate < startDate) {
      throw new AppError(ErrorCode.LEAVE_INVALID_DATES, 'end_date must be on or after start_date');
    }

    if (startDate.getUTCFullYear() !== endDate.getUTCFullYear()) {
      throw new AppError(
        ErrorCode.LEAVE_INVALID_DATES,
        'Leave requests cannot span across multiple calendar years. Please submit separate applications for each year.'
      );
    }

    // Get leave type (validates it exists and belongs to company)
    const leaveType = await leaveTypesRepository.findById(data.leave_type_id);
    if (!leaveType || leaveType.company_id !== userContext.company_id || !leaveType.is_active) {
      throw new AppError(ErrorCode.LEAVE_TYPE_NOT_FOUND, 'Leave type not found or not available');
    }

    // Calculate working days server-side (never trust client)
    const leaveYear = startDate.getUTCFullYear();
    const calendarData = await holidayService.fetchCalendarData(
      userContext.company_id,
      userContext.office_id,
      leaveYear
    );
    const workingDays = countWorkingDays(
      startDate,
      endDate,
      calendarData.holidays,
      calendarData.weeklyRules
    );

    if (workingDays <= 0) {
      throw new AppError(
        ErrorCode.LEAVE_ZERO_WORKING_DAYS,
        'No working days in the selected date range (all holidays or weekends)'
      );
    }

    return withTransaction(async (client) => {
      // Check for overlapping leaves
      const hasOverlap = await leaveRequestsRepository.hasOverlap(
        actorUserId,
        startDate,
        endDate,
        undefined,
        client
      );
      if (hasOverlap) {
        throw new AppError(
          ErrorCode.LEAVE_DATES_OVERLAP,
          'You already have a pending or approved leave request for this date range'
        );
      }

      // Lock and validate balance
      const balance = await leaveBalancesRepository.lockForUpdate(
        actorUserId,
        data.leave_type_id,
        leaveYear,
        client
      );

      if (!balance) {
        throw new AppError(
          ErrorCode.LEAVE_BALANCE_INSUFFICIENT,
          `No leave balance found for this leave type. Contact HR to initialize your balance.`
        );
      }

      const remaining = Number(balance.allocated_days) - Number(balance.used_days) - Number(balance.pending_days);
      if (workingDays > remaining) {
        throw new AppError(
          ErrorCode.LEAVE_BALANCE_INSUFFICIENT,
          `Insufficient leave balance. Requested: ${workingDays} day(s), Available: ${remaining.toFixed(2)} day(s)`
        );
      }

      // Create leave request
      const request = await leaveRequestsRepository.create({
        company_id: userContext.company_id,
        user_id: actorUserId,
        leave_type_id: data.leave_type_id,
        start_date: startDate,
        end_date: endDate,
        days_requested: workingDays,
        reason: data.reason ?? null,
      }, client);

      // Deduct from pending balance
      await leaveBalancesRepository.incrementPending(
        actorUserId,
        data.leave_type_id,
        leaveYear,
        workingDays,
        client
      );

      await auditLogsRepository.create({
        company_id: userContext.company_id,
        actor_user_id: actorUserId,
        action: AuditAction.LEAVE_APPLIED,
        entity_type: 'leave_request',
        entity_id: request.id,
        metadata: {
          leave_type_id: data.leave_type_id,
          start_date: data.start_date,
          end_date: data.end_date,
          days_requested: workingDays,
        },
      }, client);

      return request;
    });
  }

  // ─── Review (Approve / Reject) ─────────────────────────────────────────────

  async reviewLeave(
    actorUserId: string,
    requestId: string,
    action: 'APPROVE' | 'REJECT',
    reviewerNote: string | null
  ): Promise<LeaveRequestRow> {
    const reviewerContext = await usersRepository.findById(actorUserId);
    if (!reviewerContext || !reviewerContext.company_id) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Reviewer does not belong to a company');
    }

    return withTransaction(async (client) => {
      // Lock the request row within the reviewer's company
      const request = await leaveRequestsRepository.lockById(requestId, client, reviewerContext.company_id!);
      if (!request) {
        throw new AppError(ErrorCode.LEAVE_NOT_FOUND, 'Leave request not found', 404);
      }
      if (request.status !== 'PENDING') {
        throw new AppError(
          ErrorCode.LEAVE_ALREADY_REVIEWED,
          `Leave request is already ${request.status}`
        );
      }

      const newStatus: LeaveStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      const leaveYear = new Date(request.start_date).getUTCFullYear();

      // Lock the balance row too
      const balance = await leaveBalancesRepository.lockForUpdate(
        request.user_id,
        request.leave_type_id,
        leaveYear,
        client
      );

      if (action === 'APPROVE') {
        // Move pending → used
        if (balance) {
          await leaveBalancesRepository.approveLeave(
            request.user_id,
            request.leave_type_id,
            leaveYear,
            Number(request.days_requested),
            client
          );
        }
      } else {
        // REJECT: release pending back
        if (balance) {
          await leaveBalancesRepository.decrementPending(
            request.user_id,
            request.leave_type_id,
            leaveYear,
            Number(request.days_requested),
            client
          );
        }
      }

      const updated = await leaveRequestsRepository.updateStatus(
        requestId,
        newStatus,
        actorUserId,
        reviewerNote,
        client
      );

      await auditLogsRepository.create({
        actor_user_id: actorUserId,
        action: action === 'APPROVE' ? AuditAction.LEAVE_APPROVED : AuditAction.LEAVE_REJECTED,
        entity_type: 'leave_request',
        entity_id: requestId,
        metadata: { action, reviewer_note: reviewerNote, days: request.days_requested },
      }, client);

      return updated;
    });
  }

  // ─── Cancel ────────────────────────────────────────────────────────────────

  /**
   * An employee can cancel their own PENDING request.
   * An APPROVED request can be cancelled by admin/HR.
   */
  async cancelLeave(
    actorUserId: string,
    requestId: string,
    actorCompanyId: string,
    isAdmin: boolean
  ): Promise<LeaveRequestRow> {
    return withTransaction(async (client) => {
      const request = await leaveRequestsRepository.lockById(requestId, client, actorCompanyId || undefined);
      if (!request) {
        throw new AppError(ErrorCode.LEAVE_NOT_FOUND, 'Leave request not found', 404);
      }

      const isSelf = request.user_id === actorUserId;

      // Validate permissions
      if (!isSelf && !isAdmin) {
        throw new AppError(ErrorCode.PERMISSION_DENIED, 'You cannot cancel someone else\'s leave', 403);
      }
      if (isSelf && request.status !== 'PENDING') {
        throw new AppError(
          ErrorCode.LEAVE_ALREADY_REVIEWED,
          'Only PENDING requests can be self-cancelled. Contact HR to cancel approved leave.'
        );
      }
      if (!['PENDING', 'APPROVED'].includes(request.status)) {
        throw new AppError(
          ErrorCode.LEAVE_ALREADY_REVIEWED,
          `Cannot cancel a ${request.status} leave request`
        );
      }

      const leaveYear = new Date(request.start_date).getUTCFullYear();

      const balance = await leaveBalancesRepository.lockForUpdate(
        request.user_id,
        request.leave_type_id,
        leaveYear,
        client
      );

      if (balance) {
        if (request.status === 'PENDING') {
          // Release from pending
          await leaveBalancesRepository.decrementPending(
            request.user_id,
            request.leave_type_id,
            leaveYear,
            Number(request.days_requested),
            client
          );
        } else if (request.status === 'APPROVED') {
          // Release from used
          await leaveBalancesRepository.decrementUsed(
            request.user_id,
            request.leave_type_id,
            leaveYear,
            Number(request.days_requested),
            client
          );
        }
      }

      const updated = await leaveRequestsRepository.cancelByUser(requestId, client);

      await auditLogsRepository.create({
        actor_user_id: actorUserId,
        action: AuditAction.LEAVE_CANCELLED,
        entity_type: 'leave_request',
        entity_id: requestId,
        metadata: { cancelled_status: request.status, days: request.days_requested },
      }, client);

      return updated;
    });
  }

  // ─── Query ─────────────────────────────────────────────────────────────────

  async getMyRequests(
    userId: string,
    params?: { year?: number; status?: LeaveStatus; limit?: number; offset?: number }
  ) {
    return leaveRequestsRepository.findByUserId(userId, params);
  }

  async getCompanyRequests(
    companyId: string,
    params?: { year?: number; status?: LeaveStatus; userId?: string; limit?: number; offset?: number }
  ) {
    return leaveRequestsRepository.findByCompanyId(companyId, params);
  }

  async getRequestById(id: string, companyId?: string): Promise<LeaveRequestRow | null> {
    return leaveRequestsRepository.findById(id, undefined, companyId);
  }
}

export const leaveService = new LeaveService();
