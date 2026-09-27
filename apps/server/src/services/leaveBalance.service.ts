/**
 * LeaveBalanceService
 *
 * Responsible for: entitlement allocation, balance reads, and balance mutations.
 * Balance mutations (increment/decrement) are called by LeaveService inside transactions.
 */

import { pool } from '../lib/db.js';
import { leaveBalancesRepository, LeaveBalanceRow } from '../repositories/leaveBalances.repository.js';
import { leaveTypesRepository, LeaveTypeRow } from '../repositories/leaveTypes.repository.js';
import { auditLogsRepository } from '../repositories/auditLogs.repository.js';
import { withTransaction } from '../lib/db.js';
import { AuditAction } from '@workforce/shared';
import type { LeaveBalance, LeaveType } from '@workforce/shared';

export class LeaveBalanceService {
  // ─── Leave Types ───────────────────────────────────────────────────────────

  async getLeaveTypes(companyId: string): Promise<LeaveTypeRow[]> {
    return leaveTypesRepository.findByCompanyId(companyId);
  }

  async createLeaveType(
    actorUserId: string,
    companyId: string,
    data: { code: string; name: string; annual_quota: number; is_paid: boolean }
  ): Promise<LeaveTypeRow> {
    return leaveTypesRepository.create({ company_id: companyId, ...data });
  }

  async updateLeaveType(
    id: string,
    data: Partial<{ name: string; annual_quota: number; is_paid: boolean; is_active: boolean }>
  ): Promise<LeaveTypeRow | null> {
    return leaveTypesRepository.update(id, data);
  }

  // ─── Balance reads ────────────────────────────────────────────────────────

  async getBalancesForUser(userId: string, year?: number): Promise<LeaveBalanceRow[]> {
    const targetYear = year ?? new Date().getUTCFullYear();
    return leaveBalancesRepository.findByUserAndYear(userId, targetYear);
  }

  async getBalancesForCompany(companyId: string, year?: number): Promise<LeaveBalanceRow[]> {
    const targetYear = year ?? new Date().getUTCFullYear();
    return leaveBalancesRepository.findByCompanyAndYear(companyId, targetYear);
  }

  // ─── Allocation ───────────────────────────────────────────────────────────

  /**
   * Allocate (or update) a leave balance for a specific user+type+year.
   * Uses the leave type's annual_quota if allocated_days is not provided.
   */
  async allocateBalance(
    actorUserId: string,
    data: { user_id: string; leave_type_id: string; leave_year: number; allocated_days: number }
  ): Promise<LeaveBalanceRow> {
    return withTransaction(async (client) => {
      const balance = await leaveBalancesRepository.upsertAllocation(data, client);
      await auditLogsRepository.create({
        actor_user_id: actorUserId,
        action: AuditAction.LEAVE_BALANCE_ALLOCATED,
        entity_type: 'leave_balance',
        entity_id: balance.id,
        metadata: {
          user_id: data.user_id,
          leave_type_id: data.leave_type_id,
          leave_year: data.leave_year,
          allocated_days: data.allocated_days,
        },
      }, client);
      return balance;
    });
  }

  /**
   * Bulk initialize balances for all active employees of a company for a given year,
   * using each leave type's annual_quota. Safe to call multiple times (upsert).
   */
  async initializeYearlyBalancesForCompany(
    actorUserId: string,
    companyId: string,
    year: number
  ): Promise<{ initialized: number }> {
    const leaveTypes = await leaveTypesRepository.findByCompanyId(companyId);
    if (leaveTypes.length === 0) return { initialized: 0 };

    return withTransaction(async (client) => {
      // Fetch all active users in the company
      const usersRes = await client.query<{ id: string }>(
        `SELECT id FROM users WHERE company_id = $1 AND is_active = TRUE`,
        [companyId]
      );
      const users = usersRes.rows;

      let initialized = 0;
      for (const user of users) {
        for (const lt of leaveTypes) {
          if (!lt.is_active) continue;
          await leaveBalancesRepository.upsertAllocation({
            user_id: user.id,
            leave_type_id: lt.id,
            leave_year: year,
            allocated_days: Number(lt.annual_quota),
          }, client);
          initialized++;
        }
      }

      await auditLogsRepository.create({
        actor_user_id: actorUserId,
        action: AuditAction.LEAVE_BALANCE_ALLOCATED,
        entity_type: 'leave_balance',
        metadata: { company_id: companyId, year, initialized },
      }, client);

      return { initialized };
    });
  }
}

export const leaveBalanceService = new LeaveBalanceService();
