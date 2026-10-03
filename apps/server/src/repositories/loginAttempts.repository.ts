import { PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { LoginEventType } from '@workforce/shared';

export interface LoginAttemptRow {
  id: string;
  company_id?: string | null;
  user_id: string | null;
  event_type: LoginEventType;
  failure_reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  latitude: number | null;
  longitude: number | null;
  distance_meters: number | null;
  created_at: Date;
  employee_code?: string;
}

export class LoginAttemptsRepository {
  async create(
    attempt: {
      company_id?: string | null;
      user_id?: string | null;
      event_type: LoginEventType;
      failure_reason?: string | null;
      ip_address?: string | null;
      user_agent?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      distance_meters?: number | null;
    },
    client?: PoolClient
  ): Promise<LoginAttemptRow> {
    const queryClient = client || pool;
    const query = `
      INSERT INTO login_attempts (
        company_id, user_id, event_type, failure_reason, ip_address, user_agent,
        latitude, longitude, distance_meters
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const res = await queryClient.query<LoginAttemptRow>(query, [
      attempt.company_id || null,
      attempt.user_id || null,
      attempt.event_type,
      attempt.failure_reason || null,
      attempt.ip_address || null,
      attempt.user_agent || null,
      attempt.latitude || null,
      attempt.longitude || null,
      attempt.distance_meters || null,
    ]);
    return res.rows[0];
  }

  async findAll(limit = 100, companyId?: string): Promise<LoginAttemptRow[]> {
    let query = `
      SELECT 
        l.id,
        l.company_id,
        l.user_id,
        l.event_type,
        l.failure_reason,
        l.ip_address,
        l.user_agent,
        l.latitude,
        l.longitude,
        l.distance_meters,
        l.created_at,
        u.employee_code
      FROM login_attempts l
      LEFT JOIN users u ON l.user_id = u.id
    `;
    const params: unknown[] = [];
    if (companyId) {
      query += ` WHERE l.company_id = $1`;
      params.push(companyId);
    }
    params.push(limit);
    query += ` ORDER BY l.created_at DESC LIMIT $${params.length}`;

    const res = await pool.query<LoginAttemptRow>(query, params);
    return res.rows;
  }
}

export const loginAttemptsRepository = new LoginAttemptsRepository();
