import { PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { User } from '@workforce/shared';

export interface UserRow {
  id: string;
  company_id: string;
  office_id: string;
  department_id: string | null;
  role_id: string;
  employee_code: string;
  name: string;
  email: string;
  password_hash: string | null;
  is_active: boolean;
  face_enrolled: boolean;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
  firebase_uid?: string | null;
  auth_provider?: 'legacy' | 'firebase';
  firebase_linked_at?: Date | null;
  company_name?: string;
  office_name?: string;
  department_name?: string;
  role_name?: string;
  permissions?: string[];
}

export class UsersRepository {
  private baseSelect = `
    SELECT 
      u.id,
      u.company_id,
      u.office_id,
      u.department_id,
      u.role_id,
      u.employee_code,
      u.name,
      u.email,
      u.password_hash,
      u.is_active,
      u.face_enrolled,
      u.firebase_uid,
      u.auth_provider,
      u.firebase_linked_at,
      u.created_at,
      u.updated_at,
      u.last_login_at,
      c.name as company_name,
      o.name as office_name,
      d.name as department_name,
      r.name as role_name,
      COALESCE(
        array_agg(p.key) FILTER (WHERE p.key IS NOT NULL),
        '{}'
      ) as permissions
    FROM users u
    JOIN companies c ON u.company_id = c.id
    JOIN offices o ON u.office_id = o.id
    LEFT JOIN departments d ON u.department_id = d.id
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN role_permissions rp ON r.id = rp.role_id
    LEFT JOIN permissions p ON rp.permission_id = p.id
  `;

  async findById(id: string, client?: PoolClient): Promise<UserRow | null> {
    const queryClient = client || pool;
    const query = `
      ${this.baseSelect}
      WHERE u.id = $1
      GROUP BY u.id, c.name, o.name, d.name, r.name
    `;
    const res = await queryClient.query<UserRow>(query, [id]);
    return res.rows[0] || null;
  }

  async findByEmail(email: string, client?: PoolClient): Promise<UserRow | null> {
    const queryClient = client || pool;
    const query = `
      ${this.baseSelect}
      WHERE LOWER(u.email) = LOWER($1)
      GROUP BY u.id, c.name, o.name, d.name, r.name
    `;
    const res = await queryClient.query<UserRow>(query, [email]);
    return res.rows[0] || null;
  }

  async findByEmployeeCode(code: string, client?: PoolClient): Promise<UserRow | null> {
    const queryClient = client || pool;
    const query = `
      ${this.baseSelect}
      WHERE UPPER(u.employee_code) = UPPER($1)
      GROUP BY u.id, c.name, o.name, d.name, r.name
    `;
    const res = await queryClient.query<UserRow>(query, [code]);
    return res.rows[0] || null;
  }

  async findByCodeOrEmail(identifier: string, client?: PoolClient): Promise<UserRow | null> {
    const queryClient = client || pool;
    const query = `
      ${this.baseSelect}
      WHERE UPPER(u.employee_code) = UPPER($1) OR LOWER(u.email) = LOWER($1)
      GROUP BY u.id, c.name, o.name, d.name, r.name
    `;
    const res = await queryClient.query<UserRow>(query, [identifier]);
    return res.rows[0] || null;
  }

  async findByFirebaseUid(firebaseUid: string, client?: PoolClient): Promise<UserRow | null> {
    const queryClient = client || pool;
    const query = `
      ${this.baseSelect}
      WHERE u.firebase_uid = $1
      GROUP BY u.id, c.name, o.name, d.name, r.name
    `;
    const res = await queryClient.query<UserRow>(query, [firebaseUid]);
    return res.rows[0] || null;
  }

  async findAll(params?: {
    companyId?: string;
    officeId?: string;
    departmentId?: string;
    roleId?: string;
    isActive?: boolean;
    search?: string;
  }): Promise<UserRow[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params?.companyId) {
      conditions.push(`u.company_id = $${idx++}`);
      values.push(params.companyId);
    }
    if (params?.officeId) {
      conditions.push(`u.office_id = $${idx++}`);
      values.push(params.officeId);
    }
    if (params?.departmentId) {
      conditions.push(`u.department_id = $${idx++}`);
      values.push(params.departmentId);
    }
    if (params?.roleId) {
      conditions.push(`u.role_id = $${idx++}`);
      values.push(params.roleId);
    }
    if (params?.isActive !== undefined) {
      conditions.push(`u.is_active = $${idx++}`);
      values.push(params.isActive);
    }
    if (params?.search) {
      conditions.push(`(u.name ILIKE $${idx} OR u.email ILIKE $${idx} OR u.employee_code ILIKE $${idx})`);
      values.push(`%${params.search}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `
      ${this.baseSelect}
      ${whereClause}
      GROUP BY u.id, c.name, o.name, d.name, r.name
      ORDER BY u.created_at DESC
    `;

    const res = await pool.query<UserRow>(query, values);
    return res.rows;
  }

  async create(
    user: {
      company_id: string;
      office_id: string;
      department_id: string | null;
      role_id: string;
      employee_code: string;
      name: string;
      email: string;
      password_hash?: string | null;
      firebase_uid?: string | null;
      auth_provider?: 'legacy' | 'firebase';
      firebase_linked_at?: Date | null;
    },
    client?: PoolClient
  ): Promise<UserRow> {
    const queryClient = client || pool;
    const insertQuery = `
      INSERT INTO users (
        company_id, office_id, department_id, role_id,
        employee_code, name, email, password_hash,
        firebase_uid, auth_provider, firebase_linked_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `;
    const res = await queryClient.query<{ id: string }>(insertQuery, [
      user.company_id,
      user.office_id,
      user.department_id,
      user.role_id,
      user.employee_code,
      user.name,
      user.email,
      user.password_hash || null,
      user.firebase_uid || null,
      user.auth_provider || 'legacy',
      user.firebase_linked_at || null,
    ]);

    const created = await this.findById(res.rows[0].id, client);
    if (!created) {
      throw new Error('Failed to retrieve created user');
    }
    return created;
  }

  async update(
    id: string,
    updates: {
      name?: string;
      email?: string;
      office_id?: string;
      department_id?: string | null;
      role_id?: string;
      is_active?: boolean;
      face_enrolled?: boolean;
      password_hash?: string | null;
      firebase_uid?: string | null;
      auth_provider?: 'legacy' | 'firebase';
      firebase_linked_at?: Date | null;
    },
    client?: PoolClient
  ): Promise<UserRow | null> {
    const queryClient = client || pool;
    const sets: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [id];
    let idx = 2;

    if (updates.name !== undefined) {
      sets.push(`name = $${idx++}`);
      values.push(updates.name);
    }
    if (updates.email !== undefined) {
      sets.push(`email = $${idx++}`);
      values.push(updates.email);
    }
    if (updates.office_id !== undefined) {
      sets.push(`office_id = $${idx++}`);
      values.push(updates.office_id);
    }
    if (updates.department_id !== undefined) {
      sets.push(`department_id = $${idx++}`);
      values.push(updates.department_id);
    }
    if (updates.role_id !== undefined) {
      sets.push(`role_id = $${idx++}`);
      values.push(updates.role_id);
    }
    if (updates.is_active !== undefined) {
      sets.push(`is_active = $${idx++}`);
      values.push(updates.is_active);
    }
    if (updates.face_enrolled !== undefined) {
      sets.push(`face_enrolled = $${idx++}`);
      values.push(updates.face_enrolled);
    }
    if (updates.password_hash !== undefined) {
      sets.push(`password_hash = $${idx++}`);
      values.push(updates.password_hash);
    }
    if (updates.firebase_uid !== undefined) {
      sets.push(`firebase_uid = $${idx++}`);
      values.push(updates.firebase_uid);
    }
    if (updates.auth_provider !== undefined) {
      sets.push(`auth_provider = $${idx++}`);
      values.push(updates.auth_provider);
    }
    if (updates.firebase_linked_at !== undefined) {
      sets.push(`firebase_linked_at = $${idx++}`);
      values.push(updates.firebase_linked_at);
    }

    const query = `
      UPDATE users
      SET ${sets.join(', ')}
      WHERE id = $1
      RETURNING id
    `;
    const res = await queryClient.query<{ id: string }>(query, values);
    if (res.rowCount === 0) return null;

    return this.findById(id, client);
  }

  async setFaceEnrolled(id: string, enrolled: boolean, client?: PoolClient): Promise<void> {
    const queryClient = client || pool;
    await queryClient.query(
      `UPDATE users SET face_enrolled = $1, updated_at = NOW() WHERE id = $2`,
      [enrolled, id]
    );
  }

  async updateLastLogin(id: string, client?: PoolClient): Promise<void> {
    const queryClient = client || pool;
    await queryClient.query(
      `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
      [id]
    );
  }

  async updateOfficeForAllInCompany(companyId: string, officeId: string, client?: PoolClient): Promise<number> {
    const queryClient = client || pool;
    const query = `
      UPDATE users
      SET office_id = $1, updated_at = NOW()
      WHERE company_id = $2
    `;
    const res = await queryClient.query(query, [officeId, companyId]);
    return res.rowCount ?? 0;
  }
}

export const usersRepository = new UsersRepository();
