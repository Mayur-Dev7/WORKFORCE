import { PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { AuditAction, AuditLog } from '@workforce/shared';

export interface AuditLogRow {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  actor_name?: string;
  actor_email?: string;
}

export class AuditLogsRepository {
  async create(
    log: {
      actor_user_id?: string | null;
      action: AuditAction | string;
      entity_type: string;
      entity_id?: string | null;
      metadata?: Record<string, unknown> | null;
    },
    client?: PoolClient
  ): Promise<AuditLogRow> {
    const queryClient = client || pool;
    const query = `
      INSERT INTO audit_logs (
        actor_user_id, action, entity_type, entity_id, metadata
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const res = await queryClient.query<AuditLogRow>(query, [
      log.actor_user_id || null,
      log.action,
      log.entity_type,
      log.entity_id || null,
      log.metadata ? JSON.stringify(log.metadata) : null,
    ]);
    return res.rows[0];
  }

  async findAll(params?: {
    action?: string;
    entityType?: string;
    actorUserId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ rows: AuditLogRow[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params?.action) {
      conditions.push(`a.action = $${idx++}`);
      values.push(params.action);
    }
    if (params?.entityType) {
      conditions.push(`a.entity_type = $${idx++}`);
      values.push(params.entityType);
    }
    if (params?.actorUserId) {
      conditions.push(`a.actor_user_id = $${idx++}`);
      values.push(params.actorUserId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*)::int as total
      FROM audit_logs a
      ${where}
    `;
    const countRes = await pool.query<{ total: number }>(countQuery, values);
    const total = countRes.rows[0]?.total || 0;

    const limit = params?.limit || 50;
    const offset = params?.offset || 0;
    values.push(limit);
    const limitPlaceholder = `$${idx++}`;
    values.push(offset);
    const offsetPlaceholder = `$${idx++}`;

    const selectQuery = `
      SELECT 
        a.id,
        a.actor_user_id,
        a.action,
        a.entity_type,
        a.entity_id,
        a.metadata,
        a.created_at,
        u.name as actor_name,
        u.email as actor_email
      FROM audit_logs a
      LEFT JOIN users u ON a.actor_user_id = u.id
      ${where}
      ORDER BY a.created_at DESC
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `;

    const res = await pool.query<AuditLogRow>(selectQuery, values);
    return { rows: res.rows, total };
  }
}

export const auditLogsRepository = new AuditLogsRepository();
