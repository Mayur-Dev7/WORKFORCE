import { PoolClient } from 'pg';
import { pool, withTransaction } from '../lib/db.js';
import { WorkShift, ShiftBreak } from '@workforce/shared';

export interface ShiftRow {
  id: string;
  company_id: string;
  office_id: string | null;
  name: string;
  start_time: string;
  end_time: string;
  total_hours: number | string;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
  office_name?: string;
  breaks?: any[];
}

export class ShiftsRepository {
  private baseSelect = `
    SELECT 
      s.id,
      s.company_id,
      s.office_id,
      s.name,
      to_char(s.start_time, 'HH24:MI') as start_time,
      to_char(s.end_time, 'HH24:MI') as end_time,
      s.total_hours::float as total_hours,
      s.is_default,
      s.created_at,
      s.updated_at,
      o.name as office_name,
      COALESCE(
        json_agg(
          json_build_object(
            'id', b.id,
            'shift_id', b.shift_id,
            'name', b.name,
            'start_time', to_char(b.start_time, 'HH24:MI'),
            'end_time', to_char(b.end_time, 'HH24:MI'),
            'duration_minutes', b.duration_minutes,
            'is_paid', b.is_paid,
            'created_at', b.created_at,
            'updated_at', b.updated_at
          ) ORDER BY b.start_time ASC
        ) FILTER (WHERE b.id IS NOT NULL),
        '[]'
      ) as breaks
    FROM work_shifts s
    LEFT JOIN offices o ON s.office_id = o.id
    LEFT JOIN shift_breaks b ON s.id = b.shift_id
  `;

  async findAll(companyId: string, client?: PoolClient): Promise<WorkShift[]> {
    const queryClient = client || pool;
    const query = `
      ${this.baseSelect}
      WHERE s.company_id = $1
      GROUP BY s.id, o.name
      ORDER BY s.is_default DESC, s.name ASC
    `;
    const res = await queryClient.query<ShiftRow>(query, [companyId]);
    return res.rows.map(this.mapRowToWorkShift);
  }

  async findById(id: string, client?: PoolClient): Promise<WorkShift | null> {
    const queryClient = client || pool;
    const query = `
      ${this.baseSelect}
      WHERE s.id = $1
      GROUP BY s.id, o.name
    `;
    const res = await queryClient.query<ShiftRow>(query, [id]);
    return res.rows[0] ? this.mapRowToWorkShift(res.rows[0]) : null;
  }

  async findByOfficeOrCompanyDefault(
    companyId: string,
    officeId?: string | null,
    client?: PoolClient
  ): Promise<WorkShift | null> {
    const queryClient = client || pool;

    // 1. Check if there's a shift specifically assigned to this office
    if (officeId) {
      const officeShiftQuery = `
        ${this.baseSelect}
        WHERE s.company_id = $1 AND s.office_id = $2
        GROUP BY s.id, o.name
        ORDER BY s.is_default DESC, s.created_at DESC
        LIMIT 1
      `;
      const officeRes = await queryClient.query<ShiftRow>(officeShiftQuery, [companyId, officeId]);
      if (officeRes.rows[0]) {
        return this.mapRowToWorkShift(officeRes.rows[0]);
      }
    }

    // 2. Check for company default shift
    const defaultShiftQuery = `
      ${this.baseSelect}
      WHERE s.company_id = $1 AND (s.is_default = true OR s.office_id IS NULL)
      GROUP BY s.id, o.name
      ORDER BY s.is_default DESC, s.created_at DESC
      LIMIT 1
    `;
    const defaultRes = await queryClient.query<ShiftRow>(defaultShiftQuery, [companyId]);
    if (defaultRes.rows[0]) {
      return this.mapRowToWorkShift(defaultRes.rows[0]);
    }

    // 3. Any shift in the company
    const anyShiftQuery = `
      ${this.baseSelect}
      WHERE s.company_id = $1
      GROUP BY s.id, o.name
      ORDER BY s.created_at DESC
      LIMIT 1
    `;
    const anyRes = await queryClient.query<ShiftRow>(anyShiftQuery, [companyId]);
    return anyRes.rows[0] ? this.mapRowToWorkShift(anyRes.rows[0]) : null;
  }

  async create(
    data: {
      company_id: string;
      office_id?: string | null;
      name: string;
      start_time: string;
      end_time: string;
      total_hours: number;
      is_default?: boolean;
      breaks?: Array<{
        name: string;
        start_time: string;
        end_time: string;
        duration_minutes: number;
        is_paid?: boolean;
      }>;
    },
    externalClient?: PoolClient
  ): Promise<WorkShift> {
    const execute = async (client: PoolClient) => {
      // If this is set as default, unset other defaults in the company for the same office scope
      if (data.is_default) {
        if (data.office_id) {
          await client.query(
            `UPDATE work_shifts SET is_default = false WHERE company_id = $1 AND office_id = $2`,
            [data.company_id, data.office_id]
          );
        } else {
          await client.query(
            `UPDATE work_shifts SET is_default = false WHERE company_id = $1 AND office_id IS NULL`,
            [data.company_id]
          );
        }
      }

      const insertShiftQuery = `
        INSERT INTO work_shifts (
          company_id, office_id, name, start_time, end_time, total_hours, is_default
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `;

      const shiftRes = await client.query<{ id: string }>(insertShiftQuery, [
        data.company_id,
        data.office_id || null,
        data.name,
        data.start_time,
        data.end_time,
        data.total_hours,
        data.is_default || false,
      ]);

      const shiftId = shiftRes.rows[0].id;

      // Insert breaks if provided
      if (data.breaks && data.breaks.length > 0) {
        for (const b of data.breaks) {
          await client.query(
            `
            INSERT INTO shift_breaks (
              shift_id, name, start_time, end_time, duration_minutes, is_paid
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [
              shiftId,
              b.name,
              b.start_time,
              b.end_time,
              b.duration_minutes,
              b.is_paid || false,
            ]
          );
        }
      }

      const created = await this.findById(shiftId, client);
      if (!created) {
        throw new Error('Failed to retrieve newly created work shift');
      }
      return created;
    };

    if (externalClient) {
      return execute(externalClient);
    } else {
      return withTransaction(execute);
    }
  }

  async update(
    id: string,
    data: {
      office_id?: string | null;
      name?: string;
      start_time?: string;
      end_time?: string;
      total_hours?: number;
      is_default?: boolean;
      breaks?: Array<{
        name: string;
        start_time: string;
        end_time: string;
        duration_minutes: number;
        is_paid?: boolean;
      }>;
    },
    externalClient?: PoolClient
  ): Promise<WorkShift | null> {
    const execute = async (client: PoolClient) => {
      const existing = await this.findById(id, client);
      if (!existing) return null;

      if (data.is_default) {
        const targetOfficeId = data.office_id !== undefined ? data.office_id : existing.office_id;
        if (targetOfficeId) {
          await client.query(
            `UPDATE work_shifts SET is_default = false WHERE company_id = $1 AND office_id = $2 AND id != $3`,
            [existing.company_id, targetOfficeId, id]
          );
        } else {
          await client.query(
            `UPDATE work_shifts SET is_default = false WHERE company_id = $1 AND office_id IS NULL AND id != $3`,
            [existing.company_id, id]
          );
        }
      }

      const sets: string[] = ['updated_at = NOW()'];
      const values: unknown[] = [id];
      let idx = 2;

      if (data.office_id !== undefined) {
        sets.push(`office_id = $${idx++}`);
        values.push(data.office_id);
      }
      if (data.name !== undefined) {
        sets.push(`name = $${idx++}`);
        values.push(data.name);
      }
      if (data.start_time !== undefined) {
        sets.push(`start_time = $${idx++}`);
        values.push(data.start_time);
      }
      if (data.end_time !== undefined) {
        sets.push(`end_time = $${idx++}`);
        values.push(data.end_time);
      }
      if (data.total_hours !== undefined) {
        sets.push(`total_hours = $${idx++}`);
        values.push(data.total_hours);
      }
      if (data.is_default !== undefined) {
        sets.push(`is_default = $${idx++}`);
        values.push(data.is_default);
      }

      await client.query(`UPDATE work_shifts SET ${sets.join(', ')} WHERE id = $1`, values);

      // If breaks are explicitly provided, replace existing breaks
      if (data.breaks !== undefined) {
        await client.query(`DELETE FROM shift_breaks WHERE shift_id = $1`, [id]);
        for (const b of data.breaks) {
          await client.query(
            `
            INSERT INTO shift_breaks (
              shift_id, name, start_time, end_time, duration_minutes, is_paid
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [
              id,
              b.name,
              b.start_time,
              b.end_time,
              b.duration_minutes,
              b.is_paid || false,
            ]
          );
        }
      }

      return this.findById(id, client);
    };

    if (externalClient) {
      return execute(externalClient);
    } else {
      return withTransaction(execute);
    }
  }

  async delete(id: string, client?: PoolClient): Promise<boolean> {
    const queryClient = client || pool;
    const res = await queryClient.query(`DELETE FROM work_shifts WHERE id = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  }

  private mapRowToWorkShift(row: ShiftRow): WorkShift {
    return {
      id: row.id,
      company_id: row.company_id,
      office_id: row.office_id,
      name: row.name,
      start_time: row.start_time,
      end_time: row.end_time,
      total_hours: Number(row.total_hours),
      is_default: row.is_default,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
      office_name: row.office_name,
      breaks: (row.breaks || []).map((b: any) => ({
        id: b.id,
        shift_id: b.shift_id,
        name: b.name,
        start_time: b.start_time,
        end_time: b.end_time,
        duration_minutes: Number(b.duration_minutes),
        is_paid: Boolean(b.is_paid),
        created_at: b.created_at ? new Date(b.created_at).toISOString() : undefined,
        updated_at: b.updated_at ? new Date(b.updated_at).toISOString() : undefined,
      })),
    };
  }
}

export const shiftsRepository = new ShiftsRepository();
