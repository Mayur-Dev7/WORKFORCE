import { PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { CompanySettings, UpdateCompanySettingsDTO } from '@workforce/shared';

export interface CompanySettingsRow {
  company_id: string;
  work_start_time: string;
  work_end_time: string;
  grace_minutes: number;
  timezone: string;
  weekly_off_days: number[];
  casual_leaves_per_year: string | number;
  sick_leaves_per_year: string | number;
  leave_year_start_month: number;
  extra_rules: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

function mapRowToSettings(row: CompanySettingsRow): CompanySettings {
  return {
    company_id: row.company_id,
    work_start_time: String(row.work_start_time),
    work_end_time: String(row.work_end_time),
    grace_minutes: row.grace_minutes,
    timezone: row.timezone,
    weekly_off_days: row.weekly_off_days,
    casual_leaves_per_year: Number(row.casual_leaves_per_year),
    sick_leaves_per_year: Number(row.sick_leaves_per_year),
    leave_year_start_month: row.leave_year_start_month,
    extra_rules: row.extra_rules,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export class CompanySettingsRepository {
  async findByCompanyId(companyId: string, client?: PoolClient): Promise<CompanySettings | null> {
    const queryClient = client || pool;
    const res = await queryClient.query<CompanySettingsRow>(
      `SELECT * FROM company_settings WHERE company_id = $1`,
      [companyId]
    );
    return res.rows[0] ? mapRowToSettings(res.rows[0]) : null;
  }

  async createDefault(companyId: string, client?: PoolClient): Promise<CompanySettings> {
    const queryClient = client || pool;
    const res = await queryClient.query<CompanySettingsRow>(
      `INSERT INTO company_settings (company_id)
       VALUES ($1)
       ON CONFLICT (company_id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [companyId]
    );
    return mapRowToSettings(res.rows[0]);
  }

  async update(
    companyId: string,
    dto: UpdateCompanySettingsDTO,
    client?: PoolClient
  ): Promise<CompanySettings | null> {
    const queryClient = client || pool;
    const sets: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [companyId];
    let idx = 2;

    if (dto.work_start_time !== undefined) {
      sets.push(`work_start_time = $${idx++}`);
      values.push(dto.work_start_time);
    }
    if (dto.work_end_time !== undefined) {
      sets.push(`work_end_time = $${idx++}`);
      values.push(dto.work_end_time);
    }
    if (dto.grace_minutes !== undefined) {
      sets.push(`grace_minutes = $${idx++}`);
      values.push(dto.grace_minutes);
    }
    if (dto.timezone !== undefined) {
      sets.push(`timezone = $${idx++}`);
      values.push(dto.timezone);
    }
    if (dto.weekly_off_days !== undefined) {
      sets.push(`weekly_off_days = $${idx++}`);
      values.push(dto.weekly_off_days);
    }
    if (dto.casual_leaves_per_year !== undefined) {
      sets.push(`casual_leaves_per_year = $${idx++}`);
      values.push(dto.casual_leaves_per_year);
    }
    if (dto.sick_leaves_per_year !== undefined) {
      sets.push(`sick_leaves_per_year = $${idx++}`);
      values.push(dto.sick_leaves_per_year);
    }
    if (dto.leave_year_start_month !== undefined) {
      sets.push(`leave_year_start_month = $${idx++}`);
      values.push(dto.leave_year_start_month);
    }
    if (dto.extra_rules !== undefined) {
      sets.push(`extra_rules = $${idx++}`);
      values.push(JSON.stringify(dto.extra_rules));
    }

    const query = `
      UPDATE company_settings
      SET ${sets.join(', ')}
      WHERE company_id = $1
      RETURNING *
    `;
    const res = await queryClient.query<CompanySettingsRow>(query, values);
    return res.rows[0] ? mapRowToSettings(res.rows[0]) : null;
  }
}

export const companySettingsRepository = new CompanySettingsRepository();
