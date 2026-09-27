import { PoolClient } from 'pg';
import { pool } from '../lib/db.js';

export interface DepartmentRow {
  id: string;
  company_id: string;
  name: string;
  created_at: Date;
  employee_count?: number;
}

export class DepartmentsRepository {
  async findAll(companyId?: string): Promise<DepartmentRow[]> {
    const query = `
      SELECT 
        d.id,
        d.company_id,
        d.name,
        d.created_at,
        COUNT(u.id)::int as employee_count
      FROM departments d
      LEFT JOIN users u ON d.id = u.department_id
      ${companyId ? 'WHERE d.company_id = $1' : ''}
      GROUP BY d.id
      ORDER BY d.name ASC
    `;
    const res = await pool.query<DepartmentRow>(query, companyId ? [companyId] : []);
    return res.rows;
  }

  async findById(id: string, client?: PoolClient): Promise<DepartmentRow | null> {
    const queryClient = client || pool;
    const query = `
      SELECT 
        d.id,
        d.company_id,
        d.name,
        d.created_at,
        COUNT(u.id)::int as employee_count
      FROM departments d
      LEFT JOIN users u ON d.id = u.department_id
      WHERE d.id = $1
      GROUP BY d.id
    `;
    const res = await queryClient.query<DepartmentRow>(query, [id]);
    return res.rows[0] || null;
  }

  async create(
    department: { company_id: string; name: string },
    client?: PoolClient
  ): Promise<DepartmentRow> {
    const queryClient = client || pool;
    const res = await queryClient.query<DepartmentRow>(
      `
        INSERT INTO departments (company_id, name)
        VALUES ($1, $2)
        RETURNING *
      `,
      [department.company_id, department.name]
    );
    return res.rows[0];
  }

  async update(
    id: string,
    updates: { name: string },
    client?: PoolClient
  ): Promise<DepartmentRow | null> {
    const queryClient = client || pool;
    const res = await queryClient.query<DepartmentRow>(
      `
        UPDATE departments
        SET name = $2
        WHERE id = $1
        RETURNING *
      `,
      [id, updates.name]
    );
    return res.rows[0] || null;
  }
}

export const departmentsRepository = new DepartmentsRepository();
