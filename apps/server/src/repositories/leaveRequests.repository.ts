import { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import type { LeaveRequest, LeaveStatus } from '@workforce/shared';

export interface LeaveRequestRow extends LeaveRequest {}

export class LeaveRequestsRepository {
  private db: Pool;

  constructor(db: Pool = pool) {
    this.db = db;
  }

  private readonly joinedSelect = `
    SELECT
      lr.*,
      u.name         AS user_name,
      u.employee_code,
      lt.name        AS leave_type_name,
      lt.code        AS leave_type_code,
      rv.name        AS reviewer_name
    FROM leave_requests lr
    JOIN users u       ON lr.user_id = u.id
    JOIN leave_types lt ON lr.leave_type_id = lt.id
    LEFT JOIN users rv ON lr.reviewed_by = rv.id
  `;

  async findById(id: string, client?: PoolClient, companyId?: string): Promise<LeaveRequestRow | null> {
    const db = client ?? this.db;
    let query = `${this.joinedSelect} WHERE lr.id = $1`;
    const params: unknown[] = [id];
    if (companyId) {
      query += ` AND lr.company_id = $2`;
      params.push(companyId);
    }
    const res = await db.query<LeaveRequestRow>(query, params);
    return res.rows[0] ?? null;
  }

  async lockById(id: string, client: PoolClient, companyId?: string): Promise<LeaveRequestRow | null> {
    let query = `SELECT * FROM leave_requests WHERE id = $1`;
    const params: unknown[] = [id];
    if (companyId) {
      query += ` AND company_id = $2`;
      params.push(companyId);
    }
    query += ` FOR UPDATE`;
    const res = await client.query<LeaveRequestRow>(query, params);
    return res.rows[0] ?? null;
  }

  async findByUserId(
    userId: string,
    params?: { year?: number; status?: LeaveStatus; limit?: number; offset?: number; companyId?: string }
  ): Promise<{ rows: LeaveRequestRow[]; total: number }> {
    const conditions = [`lr.user_id = $1`];
    const values: unknown[] = [userId];
    let idx = 2;

    if (params?.companyId) {
      conditions.push(`lr.company_id = $${idx++}`);
      values.push(params.companyId);
    }
    if (params?.year) {
      conditions.push(`EXTRACT(YEAR FROM lr.start_date) = $${idx++}`);
      values.push(params.year);
    }
    if (params?.status) {
      conditions.push(`lr.status = $${idx++}`);
      values.push(params.status);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countRes = await this.db.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM leave_requests lr ${where}`,
      values
    );
    const total = countRes.rows[0]?.total ?? 0;

    const limit = params?.limit ?? 20;
    const offset = params?.offset ?? 0;
    values.push(limit);
    const lp = `$${idx++}`;
    values.push(offset);
    const op = `$${idx++}`;

    const res = await this.db.query<LeaveRequestRow>(
      `${this.joinedSelect} ${where} ORDER BY lr.created_at DESC LIMIT ${lp} OFFSET ${op}`,
      values
    );
    return { rows: res.rows, total };
  }

  async findByCompanyId(
    companyId: string,
    params?: { year?: number; status?: LeaveStatus; userId?: string; limit?: number; offset?: number }
  ): Promise<{ rows: LeaveRequestRow[]; total: number }> {
    const conditions = [`lr.company_id = $1`];
    const values: unknown[] = [companyId];
    let idx = 2;

    if (params?.year) {
      conditions.push(`EXTRACT(YEAR FROM lr.start_date) = $${idx++}`);
      values.push(params.year);
    }
    if (params?.status) {
      conditions.push(`lr.status = $${idx++}`);
      values.push(params.status);
    }
    if (params?.userId) {
      conditions.push(`lr.user_id = $${idx++}`);
      values.push(params.userId);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countRes = await this.db.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM leave_requests lr
       ${where}`,
      values
    );
    const total = countRes.rows[0]?.total ?? 0;

    const limit = params?.limit ?? 20;
    const offset = params?.offset ?? 0;
    values.push(limit);
    const lp = `$${idx++}`;
    values.push(offset);
    const op = `$${idx++}`;

    const res = await this.db.query<LeaveRequestRow>(
      `${this.joinedSelect} ${where} ORDER BY lr.created_at DESC LIMIT ${lp} OFFSET ${op}`,
      values
    );
    return { rows: res.rows, total };
  }

  hasOverlap = this.hasOverlapping.bind(this);

  /** Check if any PENDING or APPROVED requests overlap the given date range for a user */
  async hasOverlapping(
    userId: string,
    startDate: Date,
    endDate: Date,
    excludeId?: string,
    client?: PoolClient
  ): Promise<boolean> {
    const db = client ?? this.db;
    const values: unknown[] = [userId, startDate.toISOString().slice(0, 10), endDate.toISOString().slice(0, 10)];
    const excludeClause = excludeId ? `AND lr.id != $4` : '';
    if (excludeId) values.push(excludeId);

    const res = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM leave_requests lr
       WHERE lr.user_id = $1
         AND lr.status IN ('PENDING', 'APPROVED')
         AND lr.start_date <= $3
         AND lr.end_date >= $2
         ${excludeClause}`,
      values
    );
    return (res.rows[0]?.count ?? 0) > 0;
  }

  async create(
    data: {
      company_id: string;
      user_id: string;
      leave_type_id: string;
      start_date: Date;
      end_date: Date;
      days_requested: number;
      reason?: string | null;
    },
    client: PoolClient
  ): Promise<LeaveRequestRow> {
    const res = await client.query<LeaveRequestRow>(
      `INSERT INTO leave_requests
         (company_id, user_id, leave_type_id, start_date, end_date, days_requested, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.company_id,
        data.user_id,
        data.leave_type_id,
        data.start_date.toISOString().slice(0, 10),
        data.end_date.toISOString().slice(0, 10),
        data.days_requested,
        data.reason ?? null,
      ]
    );
    return res.rows[0];
  }

  async cancelPendingByUserId(userId: string, client?: PoolClient): Promise<number> {
    const db = client ?? this.db;
    const res = await db.query(
      `UPDATE leave_requests
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE user_id = $1 AND status = 'PENDING'`,
      [userId]
    );
    return res.rowCount ?? 0;
  }

  async updateStatus(
    id: string,
    status: LeaveStatus,
    reviewedBy: string,
    reviewerNote: string | null,
    client: PoolClient
  ): Promise<LeaveRequestRow> {
    const res = await client.query<LeaveRequestRow>(
      `UPDATE leave_requests
       SET status = $2, reviewed_by = $3, reviewed_at = NOW(), reviewer_note = $4, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status, reviewedBy, reviewerNote]
    );
    return res.rows[0];
  }

  async cancelByUser(id: string, client: PoolClient): Promise<LeaveRequestRow> {
    const res = await client.query<LeaveRequestRow>(
      `UPDATE leave_requests
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return res.rows[0];
  }
}

export const leaveRequestsRepository = new LeaveRequestsRepository();
