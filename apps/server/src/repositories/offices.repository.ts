import { PoolClient } from 'pg';
import { pool } from '../lib/db.js';

export interface OfficeRow {
  id: string;
  company_id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  employee_count?: number;
}

export class OfficesRepository {
  async findAll(companyId?: string): Promise<OfficeRow[]> {
    const query = `
      SELECT 
        o.id,
        o.company_id,
        o.name,
        o.address,
        o.latitude,
        o.longitude,
        o.radius_meters,
        o.is_active,
        o.created_at,
        o.updated_at,
        COUNT(u.id)::int as employee_count
      FROM offices o
      LEFT JOIN users u ON o.id = u.office_id
      ${companyId ? 'WHERE o.company_id = $1' : ''}
      GROUP BY o.id
      ORDER BY o.name ASC
    `;
    const res = await pool.query<OfficeRow>(query, companyId ? [companyId] : []);
    return res.rows;
  }

  async findById(id: string, client?: PoolClient): Promise<OfficeRow | null> {
    const queryClient = client || pool;
    const query = `
      SELECT 
        o.id,
        o.company_id,
        o.name,
        o.address,
        o.latitude,
        o.longitude,
        o.radius_meters,
        o.is_active,
        o.created_at,
        o.updated_at,
        COUNT(u.id)::int as employee_count
      FROM offices o
      LEFT JOIN users u ON o.id = u.office_id
      WHERE o.id = $1
      GROUP BY o.id
    `;
    const res = await queryClient.query<OfficeRow>(query, [id]);
    return res.rows[0] || null;
  }

  async create(
    office: {
      company_id: string;
      name: string;
      address?: string | null;
      latitude: number;
      longitude: number;
      radius_meters?: number;
    },
    client?: PoolClient
  ): Promise<OfficeRow> {
    const queryClient = client || pool;
    const res = await queryClient.query<OfficeRow>(
      `
        INSERT INTO offices (company_id, name, address, latitude, longitude, radius_meters)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
      [
        office.company_id,
        office.name,
        office.address || null,
        office.latitude,
        office.longitude,
        office.radius_meters || 150,
      ]
    );
    return res.rows[0];
  }

  async update(
    id: string,
    updates: {
      name?: string;
      address?: string | null;
      latitude?: number;
      longitude?: number;
      radius_meters?: number;
      is_active?: boolean;
    },
    client?: PoolClient
  ): Promise<OfficeRow | null> {
    const queryClient = client || pool;
    const sets: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [id];
    let idx = 2;

    if (updates.name !== undefined) {
      sets.push(`name = $${idx++}`);
      values.push(updates.name);
    }
    if (updates.address !== undefined) {
      sets.push(`address = $${idx++}`);
      values.push(updates.address);
    }
    if (updates.latitude !== undefined) {
      sets.push(`latitude = $${idx++}`);
      values.push(updates.latitude);
    }
    if (updates.longitude !== undefined) {
      sets.push(`longitude = $${idx++}`);
      values.push(updates.longitude);
    }
    if (updates.radius_meters !== undefined) {
      sets.push(`radius_meters = $${idx++}`);
      values.push(updates.radius_meters);
    }
    if (updates.is_active !== undefined) {
      sets.push(`is_active = $${idx++}`);
      values.push(updates.is_active);
    }

    const query = `
      UPDATE offices
      SET ${sets.join(', ')}
      WHERE id = $1
      RETURNING *
    `;
    const res = await queryClient.query<OfficeRow>(query, values);
    return res.rows[0] || null;
  }
}

export const officesRepository = new OfficesRepository();
