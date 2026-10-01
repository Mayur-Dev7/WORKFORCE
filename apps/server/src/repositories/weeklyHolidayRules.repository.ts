import { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import type { WeeklyHolidayRule } from '@workforce/shared';

export interface WeeklyHolidayRuleRow extends WeeklyHolidayRule {}

export class WeeklyHolidayRulesRepository {
  private db: Pool;

  constructor(db: Pool = pool) {
    this.db = db;
  }

  async findByCompanyId(companyId: string, activeOnly = false, client?: PoolClient): Promise<WeeklyHolidayRuleRow[]> {
    const db = client ?? this.db;
    const whereActive = activeOnly ? `AND is_active = TRUE` : '';
    const res = await db.query<WeeklyHolidayRuleRow>(
      `SELECT * FROM weekly_holiday_rules
       WHERE company_id = $1 ${whereActive}
       ORDER BY day_of_week ASC, week_of_month ASC NULLS LAST`,
      [companyId]
    );
    return res.rows;
  }

  async upsert(
    data: { company_id: string; day_of_week: number; week_of_month: number | null; is_active: boolean },
    client?: PoolClient
  ): Promise<WeeklyHolidayRuleRow> {
    const db = client ?? this.db;
    const res = await db.query<WeeklyHolidayRuleRow>(
      `INSERT INTO weekly_holiday_rules (company_id, day_of_week, week_of_month, is_active)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (company_id, day_of_week, week_of_month) DO UPDATE
         SET is_active = EXCLUDED.is_active,
             updated_at = NOW()
       RETURNING *`,
      [data.company_id, data.day_of_week, data.week_of_month, data.is_active]
    );
    return res.rows[0];
  }

  async deleteById(id: string, client?: PoolClient): Promise<boolean> {
    const db = client ?? this.db;
    const res = await db.query(
      `DELETE FROM weekly_holiday_rules WHERE id = $1`,
      [id]
    );
    return (res.rowCount ?? 0) > 0;
  }
}

export const weeklyHolidayRulesRepository = new WeeklyHolidayRulesRepository();
