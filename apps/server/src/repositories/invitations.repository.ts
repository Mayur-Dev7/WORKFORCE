import crypto from 'crypto';
import { PoolClient } from 'pg';
import { pool } from '../lib/db.js';
import { Invitation, InvitationStatus, RoleName } from '@workforce/shared';

export interface InvitationRow {
  id: string;
  company_id: string;
  company_name?: string;
  email: string;
  role_id: string;
  role_name?: string;
  department_id: string | null;
  department_name?: string;
  office_id: string | null;
  office_name?: string;
  invited_by: string;
  invited_by_name?: string;
  token_hash: string;
  status: InvitationStatus;
  expires_at: Date;
  accepted_at: Date | null;
  accepted_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapRowToInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    company_id: row.company_id,
    company_name: row.company_name,
    email: row.email,
    role_id: row.role_id,
    role_name: row.role_name as RoleName | undefined,
    department_id: row.department_id,
    department_name: row.department_name,
    office_id: row.office_id,
    office_name: row.office_name,
    invited_by: row.invited_by,
    invited_by_name: row.invited_by_name,
    status: row.status,
    expires_at: row.expires_at.toISOString(),
    accepted_at: row.accepted_at ? row.accepted_at.toISOString() : null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export class InvitationsRepository {
  private baseSelect = `
    SELECT 
      i.id,
      i.company_id,
      c.name as company_name,
      i.email,
      i.role_id,
      r.name as role_name,
      i.department_id,
      d.name as department_name,
      i.office_id,
      o.name as office_name,
      i.invited_by,
      u.name as invited_by_name,
      i.token_hash,
      i.status,
      i.expires_at,
      i.accepted_at,
      i.accepted_by_user_id,
      i.created_at,
      i.updated_at
    FROM invitations i
    JOIN companies c ON i.company_id = c.id
    JOIN roles r ON i.role_id = r.id
    LEFT JOIN departments d ON i.department_id = d.id
    LEFT JOIN offices o ON i.office_id = o.id
    JOIN users u ON i.invited_by = u.id
  `;

  async findById(id: string, client?: PoolClient): Promise<Invitation | null> {
    const queryClient = client || pool;
    const res = await queryClient.query<InvitationRow>(
      `${this.baseSelect} WHERE i.id = $1`,
      [id]
    );
    return res.rows[0] ? mapRowToInvitation(res.rows[0]) : null;
  }

  async findByCompany(
    companyId: string,
    status?: InvitationStatus,
    client?: PoolClient
  ): Promise<Invitation[]> {
    const queryClient = client || pool;
    const conditions = ['i.company_id = $1'];
    const values: unknown[] = [companyId];
    if (status) {
      conditions.push('i.status = $2');
      values.push(status);
    }
    const query = `
      ${this.baseSelect}
      WHERE ${conditions.join(' AND ')}
      ORDER BY i.created_at DESC
    `;
    const res = await queryClient.query<InvitationRow>(query, values);
    return res.rows.map(mapRowToInvitation);
  }

  async findPendingByEmail(email: string, client?: PoolClient): Promise<Invitation[]> {
    const queryClient = client || pool;
    const query = `
      ${this.baseSelect}
      WHERE LOWER(TRIM(i.email)) = LOWER(TRIM($1))
        AND i.status = 'pending'
        AND i.expires_at > NOW()
      ORDER BY i.created_at DESC
    `;
    const res = await queryClient.query<InvitationRow>(query, [email]);
    return res.rows.map(mapRowToInvitation);
  }

  async findPendingByCompanyAndEmail(
    companyId: string,
    email: string,
    client?: PoolClient
  ): Promise<Invitation | null> {
    const queryClient = client || pool;
    const query = `
      ${this.baseSelect}
      WHERE i.company_id = $1
        AND LOWER(TRIM(i.email)) = LOWER(TRIM($2))
        AND i.status = 'pending'
      LIMIT 1
    `;
    const res = await queryClient.query<InvitationRow>(query, [companyId, email]);
    return res.rows[0] ? mapRowToInvitation(res.rows[0]) : null;
  }

  async create(
    data: {
      company_id: string;
      email: string;
      role_id: string;
      department_id?: string | null;
      office_id?: string | null;
      invited_by: string;
      token_hash?: string;
      expires_at?: Date;
    },
    client?: PoolClient
  ): Promise<Invitation> {
    const queryClient = client || pool;
    const tokenHash = data.token_hash || crypto.randomBytes(32).toString('hex');
    const query = `
      INSERT INTO invitations (
        company_id, email, role_id, department_id, office_id,
        invited_by, token_hash, status, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', COALESCE($8, NOW() + INTERVAL '7 days'))
      RETURNING id
    `;
    const res = await queryClient.query<{ id: string }>(query, [
      data.company_id,
      data.email.trim().toLowerCase(),
      data.role_id,
      data.department_id || null,
      data.office_id || null,
      data.invited_by,
      tokenHash,
      data.expires_at || null,
    ]);

    const created = await this.findById(res.rows[0].id, client);
    if (!created) {
      throw new Error('Failed to retrieve created invitation');
    }
    return created;
  }

  async markAccepted(id: string, userId: string, client?: PoolClient): Promise<boolean> {
    const queryClient = client || pool;
    const res = await queryClient.query(
      `UPDATE invitations
       SET status = 'accepted',
           accepted_at = NOW(),
           accepted_by_user_id = $2,
           updated_at = NOW()
       WHERE id = $1 AND status = 'pending'`,
      [id, userId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  async markStatus(
    id: string,
    status: 'revoked' | 'expired',
    client?: PoolClient
  ): Promise<boolean> {
    const queryClient = client || pool;
    const res = await queryClient.query(
      `UPDATE invitations
       SET status = $2, updated_at = NOW()
       WHERE id = $1`,
      [id, status]
    );
    return (res.rowCount ?? 0) > 0;
  }
}

export const invitationsRepository = new InvitationsRepository();
