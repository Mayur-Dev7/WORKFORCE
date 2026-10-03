import { Pool, PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import type { LeaveBalance } from '@workforce/shared';

export interface LeaveBalanceRow extends LeaveBalance {}

export class LeaveBalancesRepository {
  private db: Pool;

  constructor(db: Pool = pool) {
    this.db = db;
  }

  async findByUserAndYear(userId: string, year: number): Promise<LeaveBalanceRow[]> {
    const res = await this.db.query<LeaveBalanceRow>(
      `SELECT
         lb.*,
         lt.code  AS leave_type_code,
         lt.name  AS leave_type_name,
         (lb.allocated_days - lb.used_days - lb.pending_days) AS remaining_days
       FROM leave_balances lb
       JOIN leave_types lt ON lb.leave_type_id = lt.id
       WHERE lb.user_id = $1 AND lb.leave_year = $2
       ORDER BY lt.code ASC`,
      [userId, year]
    );
    return res.rows;
  }

  async findByUserTypeYear(
    userId: string,
    leaveTypeId: string,
    year: number,
    client?: PoolClient
  ): Promise<LeaveBalanceRow | null> {
    const db = client ?? this.db;
    const res = await db.query<LeaveBalanceRow>(
      `SELECT
         lb.*,
         lt.code  AS leave_type_code,
         lt.name  AS leave_type_name,
         (lb.allocated_days - lb.used_days - lb.pending_days) AS remaining_days
       FROM leave_balances lb
       JOIN leave_types lt ON lb.leave_type_id = lt.id
       WHERE lb.user_id = $1 AND lb.leave_type_id = $2 AND lb.leave_year = $3`,
      [userId, leaveTypeId, year]
    );
    return res.rows[0] ?? null;
  }

  /** Lock the row with SELECT FOR UPDATE inside a transaction */
  async lockForUpdate(
    userId: string,
    leaveTypeId: string,
    year: number,
    client: PoolClient
  ): Promise<LeaveBalanceRow | null> {
    const res = await client.query<LeaveBalanceRow>(
      `SELECT * FROM leave_balances
       WHERE user_id = $1 AND leave_type_id = $2 AND leave_year = $3
       FOR UPDATE`,
      [userId, leaveTypeId, year]
    );
    return res.rows[0] ?? null;
  }

  async upsertAllocation(
    data: { company_id?: string; user_id: string; leave_type_id: string; leave_year: number; allocated_days: number },
    client?: PoolClient
  ): Promise<LeaveBalanceRow> {
    const db = client ?? this.db;
    const res = await db.query<LeaveBalanceRow>(
      `INSERT INTO leave_balances (company_id, user_id, leave_type_id, leave_year, allocated_days)
       VALUES (
         COALESCE($1, (SELECT company_id FROM leave_types WHERE id = $3)),
         $2, $3, $4, $5
       )
       ON CONFLICT (user_id, leave_type_id, leave_year) DO UPDATE
         SET allocated_days = EXCLUDED.allocated_days,
             updated_at = NOW()
       RETURNING *`,
      [data.company_id || null, data.user_id, data.leave_type_id, data.leave_year, data.allocated_days]
    );
    return res.rows[0];
  }

  async incrementPending(
    userId: string,
    leaveTypeId: string,
    year: number,
    days: number,
    client: PoolClient
  ): Promise<LeaveBalanceRow> {
    const res = await client.query<LeaveBalanceRow>(
      `UPDATE leave_balances
       SET pending_days = pending_days + $4, updated_at = NOW()
       WHERE user_id = $1 AND leave_type_id = $2 AND leave_year = $3
       RETURNING *`,
      [userId, leaveTypeId, year, days]
    );
    return res.rows[0];
  }

  async approveLeave(
    userId: string,
    leaveTypeId: string,
    year: number,
    days: number,
    client: PoolClient
  ): Promise<LeaveBalanceRow> {
    // Move from pending → used
    const res = await client.query<LeaveBalanceRow>(
      `UPDATE leave_balances
       SET
         pending_days = GREATEST(0, pending_days - $4),
         used_days    = used_days + $4,
         updated_at   = NOW()
       WHERE user_id = $1 AND leave_type_id = $2 AND leave_year = $3
       RETURNING *`,
      [userId, leaveTypeId, year, days]
    );
    return res.rows[0];
  }

  async decrementPending(
    userId: string,
    leaveTypeId: string,
    year: number,
    days: number,
    client: PoolClient
  ): Promise<LeaveBalanceRow> {
    const res = await client.query<LeaveBalanceRow>(
      `UPDATE leave_balances
       SET pending_days = GREATEST(0, pending_days - $4), updated_at = NOW()
       WHERE user_id = $1 AND leave_type_id = $2 AND leave_year = $3
       RETURNING *`,
      [userId, leaveTypeId, year, days]
    );
    return res.rows[0];
  }

  async decrementUsed(
    userId: string,
    leaveTypeId: string,
    year: number,
    days: number,
    client: PoolClient
  ): Promise<LeaveBalanceRow> {
    const res = await client.query<LeaveBalanceRow>(
      `UPDATE leave_balances
       SET used_days = GREATEST(0, used_days - $4), updated_at = NOW()
       WHERE user_id = $1 AND leave_type_id = $2 AND leave_year = $3
       RETURNING *`,
      [userId, leaveTypeId, year, days]
    );
    return res.rows[0];
  }

  /** Admin: get all balances for a specific year across a company */
  async findByCompanyAndYear(companyId: string, year: number): Promise<LeaveBalanceRow[]> {
    const res = await this.db.query<LeaveBalanceRow>(
      `SELECT
         lb.*,
         lt.code  AS leave_type_code,
         lt.name  AS leave_type_name,
         (lb.allocated_days - lb.used_days - lb.pending_days) AS remaining_days
       FROM leave_balances lb
       JOIN leave_types lt ON lb.leave_type_id = lt.id
       WHERE lb.company_id = $1 AND lb.leave_year = $2
       ORDER BY lb.user_id, lt.code ASC`,
      [companyId, year]
    );
    return res.rows;
  }
}

export const leaveBalancesRepository = new LeaveBalancesRepository();
