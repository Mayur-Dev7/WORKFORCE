import { pool } from '../lib/db.js';
import { PermissionKey } from '@workforce/shared';

export interface PermissionRow {
  id: string;
  key: PermissionKey;
  description: string | null;
}

export class PermissionsRepository {
  async findAll(): Promise<PermissionRow[]> {
    const res = await pool.query<PermissionRow>(`
      SELECT id, key, description
      FROM permissions
      ORDER BY key ASC
    `);
    return res.rows;
  }

  async findByRoleId(roleId: string): Promise<PermissionRow[]> {
    const res = await pool.query<PermissionRow>(
      `
        SELECT p.id, p.key, p.description
        FROM permissions p
        JOIN role_permissions rp ON p.id = rp.permission_id
        WHERE rp.role_id = $1
        ORDER BY p.key ASC
      `,
      [roleId]
    );
    return res.rows;
  }
}

export const permissionsRepository = new PermissionsRepository();
