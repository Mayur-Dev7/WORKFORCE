import { PoolClient } from 'pg';
import { pool } from '../lib/db.js';

export interface CompanyRow {
  id: string;
  name: string;
  owner_user_id: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export class CompaniesRepository {
  async findById(id: string, client?: PoolClient): Promise<CompanyRow | null> {
    const queryClient = client || pool;
    const res = await queryClient.query<CompanyRow>(
      `SELECT id, name, owner_user_id, is_active, created_at, updated_at
       FROM companies
       WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  }

  async findByName(name: string, client?: PoolClient): Promise<CompanyRow | null> {
    const queryClient = client || pool;
    const res = await queryClient.query<CompanyRow>(
      `SELECT id, name, owner_user_id, is_active, created_at, updated_at
       FROM companies
       WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))`,
      [name]
    );
    return res.rows[0] || null;
  }

  async create(
    data: { name: string; owner_user_id?: string | null },
    client?: PoolClient
  ): Promise<CompanyRow> {
    const queryClient = client || pool;
    const res = await queryClient.query<CompanyRow>(
      `INSERT INTO companies (name, owner_user_id, is_active)
       VALUES ($1, $2, true)
       RETURNING id, name, owner_user_id, is_active, created_at, updated_at`,
      [data.name.trim(), data.owner_user_id || null]
    );
    return res.rows[0];
  }

  async update(
    id: string,
    updates: { name?: string; owner_user_id?: string | null; is_active?: boolean },
    client?: PoolClient
  ): Promise<CompanyRow | null> {
    const queryClient = client || pool;
    const sets: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [id];
    let idx = 2;

    if (updates.name !== undefined) {
      sets.push(`name = $${idx++}`);
      values.push(updates.name.trim());
    }
    if (updates.owner_user_id !== undefined) {
      sets.push(`owner_user_id = $${idx++}`);
      values.push(updates.owner_user_id);
    }
    if (updates.is_active !== undefined) {
      sets.push(`is_active = $${idx++}`);
      values.push(updates.is_active);
    }

    const query = `
      UPDATE companies
      SET ${sets.join(', ')}
      WHERE id = $1
      RETURNING id, name, owner_user_id, is_active, created_at, updated_at
    `;
    const res = await queryClient.query<CompanyRow>(query, values);
    return res.rows[0] || null;
  }

  /**
   * Serializes admin changes per company using row-level locking on active COMPANY_ADMINs.
   * Prevents sole-admin race conditions on leave, remove, or role-demote.
   */
  async lockAdmins(companyId: string, client: PoolClient): Promise<{ id: string; email: string }[]> {
    const res = await client.query<{ id: string; email: string }>(
      `SELECT u.id, u.email
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.company_id = $1
         AND r.name = 'COMPANY_ADMIN'
         AND u.is_active = true
       FOR UPDATE`,
      [companyId]
    );
    return res.rows;
  }

  async countActiveAdmins(companyId: string, client?: PoolClient): Promise<number> {
    const queryClient = client || pool;
    const res = await queryClient.query<{ count: string }>(
      `SELECT COUNT(*)::text as count
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.company_id = $1
         AND r.name = 'COMPANY_ADMIN'
         AND u.is_active = true`,
      [companyId]
    );
    return parseInt(res.rows[0]?.count || '0', 10);
  }
}

export const companiesRepository = new CompaniesRepository();
