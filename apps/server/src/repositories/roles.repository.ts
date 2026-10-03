import { pool } from '../lib/db.js';
import { RoleName } from '@workforce/shared';

export interface RoleRow {
  id: string;
  name: RoleName;
  description: string | null;
  created_at: Date;
  permissions?: string[];
}

export class RolesRepository {
  async findAll(): Promise<RoleRow[]> {
    const query = `
      SELECT 
        r.id,
        r.name,
        r.description,
        r.created_at,
        COALESCE(array_agg(p.key) FILTER (WHERE p.key IS NOT NULL), '{}') as permissions
      FROM roles r
      LEFT JOIN role_permissions rp ON r.id = rp.role_id
      LEFT JOIN permissions p ON rp.permission_id = p.id
      WHERE r.name != 'SUPER_ADMIN'
      GROUP BY r.id
      ORDER BY 
        CASE r.name 
          WHEN 'COMPANY_ADMIN' THEN 1
          WHEN 'HR_ADMIN' THEN 2
          WHEN 'MANAGER' THEN 3
          WHEN 'EMPLOYEE' THEN 4
          ELSE 5
        END ASC
    `;
    const res = await pool.query<RoleRow>(query);
    return res.rows;
  }

  async findByName(name: string): Promise<RoleRow | null> {
    const query = `
      SELECT 
        r.id,
        r.name,
        r.description,
        r.created_at,
        COALESCE(array_agg(p.key) FILTER (WHERE p.key IS NOT NULL), '{}') as permissions
      FROM roles r
      LEFT JOIN role_permissions rp ON r.id = rp.role_id
      LEFT JOIN permissions p ON rp.permission_id = p.id
      WHERE r.name = $1
      GROUP BY r.id
    `;
    const res = await pool.query<RoleRow>(query, [name]);
    return res.rows[0] || null;
  }

  async findById(id: string): Promise<RoleRow | null> {
    const query = `
      SELECT 
        r.id,
        r.name,
        r.description,
        r.created_at,
        COALESCE(array_agg(p.key) FILTER (WHERE p.key IS NOT NULL), '{}') as permissions
      FROM roles r
      LEFT JOIN role_permissions rp ON r.id = rp.role_id
      LEFT JOIN permissions p ON rp.permission_id = p.id
      WHERE r.id = $1
      GROUP BY r.id
    `;
    const res = await pool.query<RoleRow>(query, [id]);
    return res.rows[0] || null;
  }

  async updateRolePermissions(roleId: string, permissionKeys: string[]): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM role_permissions WHERE role_id = $1`, [roleId]);

      if (permissionKeys.length > 0) {
        const insertQuery = `
          INSERT INTO role_permissions (role_id, permission_id)
          SELECT $1, p.id
          FROM permissions p
          WHERE p.key = ANY($2::text[])
        `;
        await client.query(insertQuery, [roleId, permissionKeys]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

export const rolesRepository = new RolesRepository();
