import { PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { LoginEventType } from '@workforce/shared';

export interface LoginAttemptRow {
  id: string;
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
        user_id, event_type, failure_reason, ip_address, user_agent,
        latitude, longitude, distance_meters
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const res = await queryClient.query<LoginAttemptRow>(query, [
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

  async findAll(limit = 100): Promise<LoginAttemptRow[]> {
    const query = `
      SELECT 
        l.id,
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
      ORDER BY l.created_at DESC
      LIMIT $1
    `;
    const res = await pool.query<LoginAttemptRow>(query, [limit]);
    return res.rows;
  }
}

export const loginAttemptsRepository = new LoginAttemptsRepository();
