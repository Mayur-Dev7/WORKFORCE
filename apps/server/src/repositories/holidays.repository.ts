import { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import type { Holiday } from '@workforce/shared';

export interface HolidayRow extends Holiday {}

export class HolidaysRepository {
  private db: Pool;

  constructor(db: Pool = pool) {
    this.db = db;
  }

  async findByCompanyId(
    companyId: string,
    params?: { year?: number; officeId?: string | null; activeOnly?: boolean }
  ): Promise<HolidayRow[]> {
    const conditions = [`company_id = $1`];
    const values: unknown[] = [companyId];
    let idx = 2;

    if (params?.year) {
      // Include both recurring (any year matches) and non-recurring (specific year)
      conditions.push(
        `(is_recurring = TRUE OR EXTRACT(YEAR FROM holiday_date) = $${idx++})`
      );
      values.push(params.year);
    }
    if (params?.officeId !== undefined) {
      if (params.officeId === null) {
        conditions.push(`office_id IS NULL`);
      } else {
        conditions.push(`(office_id IS NULL OR office_id = $${idx++})`);
        values.push(params.officeId);
      }
    }
    if (params?.activeOnly) {
      conditions.push(`is_active = TRUE`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const res = await this.db.query<HolidayRow>(
      `SELECT * FROM holidays ${where} ORDER BY holiday_date ASC`,
      values
    );
    return res.rows;
  }

  async findById(id: string, companyId?: string): Promise<HolidayRow | null> {
    let query = `SELECT * FROM holidays WHERE id = $1`;
    const params: unknown[] = [id];
    if (companyId) {
      query += ` AND company_id = $2`;
      params.push(companyId);
    }
    const res = await this.db.query<HolidayRow>(query, params);
    return res.rows[0] ?? null;
  }

  async create(
    data: {
      company_id: string;
      office_id?: string | null;
      name: string;
      description?: string | null;
      holiday_date: string;
      is_recurring?: boolean;
    },
    client?: PoolClient
  ): Promise<HolidayRow> {
    const db = client ?? this.db;
    const res = await db.query<HolidayRow>(
      `INSERT INTO holidays (company_id, office_id, name, description, holiday_date, is_recurring)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.company_id,
        data.office_id ?? null,
        data.name,
        data.description ?? null,
        data.holiday_date,
        data.is_recurring ?? false,
      ]
    );
    return res.rows[0];
  }

  async update(
    id: string,
    data: Partial<{ name: string; description: string | null; holiday_date: string; is_recurring: boolean; is_active: boolean }>,
    client?: PoolClient,
    companyId?: string
  ): Promise<HolidayRow | null> {
    const db = client ?? this.db;
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) { setClauses.push(`name = $${idx++}`); values.push(data.name); }
    if (data.description !== undefined) { setClauses.push(`description = $${idx++}`); values.push(data.description); }
    if (data.holiday_date !== undefined) { setClauses.push(`holiday_date = $${idx++}`); values.push(data.holiday_date); }
    if (data.is_recurring !== undefined) { setClauses.push(`is_recurring = $${idx++}`); values.push(data.is_recurring); }
    if (data.is_active !== undefined) { setClauses.push(`is_active = $${idx++}`); values.push(data.is_active); }

    if (setClauses.length === 0) return this.findById(id);

    setClauses.push(`updated_at = NOW()`);
    values.push(id);
    let whereClause = `WHERE id = $${idx++}`;
    if (companyId) {
      whereClause += ` AND company_id = $${idx++}`;
      values.push(companyId);
    }

    const res = await db.query<HolidayRow>(
      `UPDATE holidays SET ${setClauses.join(', ')} ${whereClause} RETURNING *`,
      values
    );
    return res.rows[0] ?? null;
  }

  async deleteById(id: string, client?: PoolClient, companyId?: string): Promise<boolean> {
    const db = client ?? this.db;
    let query = `DELETE FROM holidays WHERE id = $1`;
    const params: unknown[] = [id];
    if (companyId) {
      query += ` AND company_id = $2`;
      params.push(companyId);
    }
    const res = await db.query(query, params);
    return (res.rowCount ?? 0) > 0;
  }
}

export const holidaysRepository = new HolidaysRepository();
