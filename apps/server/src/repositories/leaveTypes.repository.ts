import { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import type { LeaveType } from '@workforce/shared';

export interface LeaveTypeRow extends LeaveType {}

export class LeaveTypesRepository {
  private db: Pool;

  constructor(db: Pool = pool) {
    this.db = db;
  }

  async findByCompanyId(companyId: string): Promise<LeaveTypeRow[]> {
    const res = await this.db.query<LeaveTypeRow>(
      `SELECT * FROM leave_types WHERE company_id = $1 ORDER BY code ASC`,
      [companyId]
    );
    return res.rows;
  }

  async findById(id: string): Promise<LeaveTypeRow | null> {
    const res = await this.db.query<LeaveTypeRow>(
      `SELECT * FROM leave_types WHERE id = $1`,
      [id]
    );
    return res.rows[0] ?? null;
  }

  async findByCompanyAndCode(companyId: string, code: string): Promise<LeaveTypeRow | null> {
    const res = await this.db.query<LeaveTypeRow>(
      `SELECT * FROM leave_types WHERE company_id = $1 AND code = $2`,
      [companyId, code]
    );
    return res.rows[0] ?? null;
  }

  async create(
    data: {
      company_id: string;
      code: string;
      name: string;
      annual_quota: number;
      is_paid?: boolean;
    },
    client?: PoolClient
  ): Promise<LeaveTypeRow> {
    const db = client ?? this.db;
    const res = await db.query<LeaveTypeRow>(
      `INSERT INTO leave_types (company_id, code, name, annual_quota, is_paid)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.company_id, data.code.toUpperCase(), data.name, data.annual_quota, data.is_paid ?? false]
    );
    return res.rows[0];
  }

  async update(
    id: string,
    data: Partial<{ name: string; annual_quota: number; is_paid: boolean; is_active: boolean }>,
    client?: PoolClient
  ): Promise<LeaveTypeRow | null> {
    const db = client ?? this.db;
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) { setClauses.push(`name = $${idx++}`); values.push(data.name); }
    if (data.annual_quota !== undefined) { setClauses.push(`annual_quota = $${idx++}`); values.push(data.annual_quota); }
    if (data.is_paid !== undefined) { setClauses.push(`is_paid = $${idx++}`); values.push(data.is_paid); }
    if (data.is_active !== undefined) { setClauses.push(`is_active = $${idx++}`); values.push(data.is_active); }

    if (setClauses.length === 0) return this.findById(id);

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const res = await db.query<LeaveTypeRow>(
      `UPDATE leave_types SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return res.rows[0] ?? null;
  }

  /** Upsert for seeding: insert if not exists, ignore if exists */
  async upsertForSeed(
    data: { company_id: string; code: string; name: string; annual_quota: number; is_paid: boolean },
    client?: PoolClient
  ): Promise<LeaveTypeRow> {
    const db = client ?? this.db;
    const res = await db.query<LeaveTypeRow>(
      `INSERT INTO leave_types (company_id, code, name, annual_quota, is_paid)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (company_id, code) DO UPDATE
         SET name = EXCLUDED.name,
             annual_quota = EXCLUDED.annual_quota,
             is_paid = EXCLUDED.is_paid,
             updated_at = NOW()
       RETURNING *`,
      [data.company_id, data.code, data.name, data.annual_quota, data.is_paid]
    );
    return res.rows[0];
  }
}

export const leaveTypesRepository = new LeaveTypesRepository();
