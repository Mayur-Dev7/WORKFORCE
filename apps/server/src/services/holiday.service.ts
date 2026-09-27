/**
 * HolidayService
 *
 * Owns: holiday CRUD, weekly holiday rule CRUD, holiday calendar lookup.
 * Does NOT contain leave request or balance logic.
 *
 * Calendar logic (date math) is delegated to pure functions in holidayResolver.ts.
 */

import { holidaysRepository, HolidayRow } from '../repositories/holidays.repository.js';
import { weeklyHolidayRulesRepository, WeeklyHolidayRuleRow } from '../repositories/weeklyHolidayRules.repository.js';
import { auditLogsRepository } from '../repositories/auditLogs.repository.js';
import { withTransaction } from '../lib/db.js';
import { countWorkingDays } from '../lib/calendar/holidayResolver.js';
import { AuditAction } from '@workforce/shared';
import type { Holiday, WeeklyHolidayRule } from '@workforce/shared';

export class HolidayService {
  // ─── Holidays ──────────────────────────────────────────────────────────────

  async getHolidaysForCompany(
    companyId: string,
    params?: { year?: number; officeId?: string | null; activeOnly?: boolean }
  ): Promise<HolidayRow[]> {
    return holidaysRepository.findByCompanyId(companyId, params);
  }

  async getHolidayById(id: string): Promise<HolidayRow | null> {
    return holidaysRepository.findById(id);
  }

  async createHoliday(
    actorUserId: string,
    companyId: string,
    data: {
      office_id?: string | null;
      name: string;
      description?: string | null;
      holiday_date: string;
      is_recurring?: boolean;
    }
  ): Promise<HolidayRow> {
    return withTransaction(async (client) => {
      const holiday = await holidaysRepository.create(
        { company_id: companyId, ...data },
        client
      );
      await auditLogsRepository.create({
        actor_user_id: actorUserId,
        action: AuditAction.HOLIDAY_CREATED,
        entity_type: 'holiday',
        entity_id: holiday.id,
        metadata: { name: holiday.name, holiday_date: holiday.holiday_date },
      }, client);
      return holiday;
    });
  }

  async updateHoliday(
    actorUserId: string,
    id: string,
    data: Partial<{ name: string; description: string | null; holiday_date: string; is_recurring: boolean; is_active: boolean }>
  ): Promise<HolidayRow | null> {
    return withTransaction(async (client) => {
      const holiday = await holidaysRepository.update(id, data, client);
      if (!holiday) return null;
      await auditLogsRepository.create({
        actor_user_id: actorUserId,
        action: AuditAction.HOLIDAY_UPDATED,
        entity_type: 'holiday',
        entity_id: id,
        metadata: data as Record<string, unknown>,
      }, client);
      return holiday;
    });
  }

  async deleteHoliday(actorUserId: string, id: string): Promise<boolean> {
    return withTransaction(async (client) => {
      const deleted = await holidaysRepository.deleteById(id, client);
      if (deleted) {
        await auditLogsRepository.create({
          actor_user_id: actorUserId,
          action: AuditAction.HOLIDAY_DELETED,
          entity_type: 'holiday',
          entity_id: id,
        }, client);
      }
      return deleted;
    });
  }

  // ─── Weekly Holiday Rules ──────────────────────────────────────────────────

  async getWeeklyRules(companyId: string): Promise<WeeklyHolidayRuleRow[]> {
    return weeklyHolidayRulesRepository.findByCompanyId(companyId);
  }

  async upsertWeeklyRule(
    actorUserId: string,
    companyId: string,
    rule: { day_of_week: number; week_of_month: number | null; is_active: boolean }
  ): Promise<WeeklyHolidayRuleRow> {
    return withTransaction(async (client) => {
      const saved = await weeklyHolidayRulesRepository.upsert(
        { company_id: companyId, ...rule },
        client
      );
      await auditLogsRepository.create({
        actor_user_id: actorUserId,
        action: AuditAction.WEEKLY_RULE_UPDATED,
        entity_type: 'weekly_holiday_rule',
        entity_id: saved.id,
        metadata: rule as Record<string, unknown>,
      }, client);
      return saved;
    });
  }

  async batchUpsertWeeklyRules(
    actorUserId: string,
    companyId: string,
    rules: Array<{ day_of_week: number; week_of_month: number | null; is_active: boolean }>
  ): Promise<WeeklyHolidayRuleRow[]> {
    return withTransaction(async (client) => {
      const results: WeeklyHolidayRuleRow[] = [];
      for (const rule of rules) {
        const saved = await weeklyHolidayRulesRepository.upsert(
          { company_id: companyId, ...rule },
          client
        );
        results.push(saved);
      }
      await auditLogsRepository.create({
        actor_user_id: actorUserId,
        action: AuditAction.WEEKLY_RULE_UPDATED,
        entity_type: 'weekly_holiday_rule',
        metadata: { count: rules.length } as Record<string, unknown>,
      }, client);
      return results;
    });
  }

  // ─── Working Days Calculator ───────────────────────────────────────────────

  /**
   * Fetch holidays + weekly rules from DB, then delegate pure date math
   * to holidayResolver.countWorkingDays (no DB access in that function).
   */
  async countWorkingDays(
    companyId: string,
    officeId: string | null,
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    const year = startDate.getUTCFullYear();
    const [holidays, weeklyRules] = await Promise.all([
      holidaysRepository.findByCompanyId(companyId, { year, officeId, activeOnly: true }),
      weeklyHolidayRulesRepository.findByCompanyId(companyId, true),
    ]);
    return countWorkingDays(startDate, endDate, holidays, weeklyRules);
  }

  /** Same as above but returns the raw holiday + rule data (for use in LeaveService) */
  async fetchCalendarData(
    companyId: string,
    officeId: string | null,
    year: number
  ): Promise<{ holidays: Holiday[]; weeklyRules: WeeklyHolidayRule[] }> {
    const [holidays, weeklyRules] = await Promise.all([
      holidaysRepository.findByCompanyId(companyId, { year, officeId, activeOnly: true }),
      weeklyHolidayRulesRepository.findByCompanyId(companyId, true),
    ]);
    return { holidays, weeklyRules };
  }
}

export const holidayService = new HolidayService();
