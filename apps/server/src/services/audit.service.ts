import { auditLogsRepository, AuditLogRow } from '../repositories/auditLogs.repository.js';
import { AuditLog } from '@workforce/shared';

function mapRowToAuditLog(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    actor_user_id: row.actor_user_id,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    metadata: row.metadata,
    created_at: row.created_at.toISOString(),
    actor_name: row.actor_name,
    actor_email: row.actor_email,
  };
}

export class AuditService {
  async getAuditLogs(params?: {
    companyId?: string;
    action?: string;
    entityType?: string;
    actorUserId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: AuditLog[]; total: number }> {
    const { rows, total } = await auditLogsRepository.findAll(params);
    return {
      logs: rows.map(mapRowToAuditLog),
      total,
    };
  }
}

export const auditService = new AuditService();
