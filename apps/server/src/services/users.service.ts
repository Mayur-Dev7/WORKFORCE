import bcrypt from 'bcrypt';
import { withTransaction } from '../lib/db.js';
import { usersRepository, UserRow } from '../repositories/users.repository.js';
import { faceTemplatesRepository } from '../repositories/faceTemplates.repository.js';
import { auditLogsRepository } from '../repositories/auditLogs.repository.js';
import { faceService } from './face.service.js';
import { User, RoleName, PermissionKey, AuditAction, ErrorCode } from '@workforce/shared';

function mapRowToUser(row: UserRow): User {
  return {
    id: row.id,
    company_id: row.company_id,
    office_id: row.office_id,
    department_id: row.department_id,
    role_id: row.role_id,
    employee_code: row.employee_code,
    name: row.name,
    email: row.email,
    is_active: row.is_active,
    face_enrolled: row.face_enrolled,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    last_login_at: row.last_login_at ? row.last_login_at.toISOString() : null,
    company_name: row.company_name,
    office_name: row.office_name,
    department_name: row.department_name,
    role_name: row.role_name as RoleName,
    permissions: (row.permissions || []) as PermissionKey[],
  };
}

export class UsersService {
  async getAllUsers(params?: {
    companyId?: string;
    officeId?: string;
    departmentId?: string;
    roleId?: string;
    isActive?: boolean;
    search?: string;
  }): Promise<User[]> {
    const rows = await usersRepository.findAll(params);
    return rows.map(mapRowToUser);
  }

  async getUserById(id: string): Promise<User | null> {
    const row = await usersRepository.findById(id);
    return row ? mapRowToUser(row) : null;
  }

  async createUser(
    creatorUserId: string,
    data: {
      company_id: string;
      office_id: string;
      department_id?: string | null;
      role_id: string;
      employee_code: string;
      name: string;
      email: string;
      password?: string;
    }
  ): Promise<User> {
    const existing = await usersRepository.findByCodeOrEmail(data.employee_code);
    if (existing) {
      const err = new Error('Employee code or email already in use');
      (err as any).code = ErrorCode.VALIDATION_ERROR;
      throw err;
    }

    const passwordHash = await bcrypt.hash(data.password || 'Password123!', 10);

    return withTransaction(async (client) => {
      const createdRow = await usersRepository.create(
        {
          company_id: data.company_id,
          office_id: data.office_id,
          department_id: data.department_id || null,
          role_id: data.role_id,
          employee_code: data.employee_code,
          name: data.name,
          email: data.email,
          password_hash: passwordHash,
        },
        client
      );

      await auditLogsRepository.create(
        {
          actor_user_id: creatorUserId,
          action: AuditAction.USER_CREATED,
          entity_type: 'user',
          entity_id: createdRow.id,
          metadata: {
            employeeCode: createdRow.employee_code,
            email: createdRow.email,
            roleId: createdRow.role_id,
          },
        },
        client
      );

      return mapRowToUser(createdRow);
    });
  }

  async updateUser(
    updaterUserId: string,
    id: string,
    data: {
      name?: string;
      email?: string;
      office_id?: string;
      department_id?: string | null;
      role_id?: string;
      is_active?: boolean;
      password?: string;
    }
  ): Promise<User> {
    const existing = await usersRepository.findById(id);
    if (!existing) {
      const err = new Error('User not found');
      (err as any).code = ErrorCode.USER_NOT_FOUND;
      throw err;
    }

    let passwordHash: string | undefined;
    if (data.password) {
      passwordHash = await bcrypt.hash(data.password, 10);
    }

    return withTransaction(async (client) => {
      const updatedRow = await usersRepository.update(
        id,
        {
          name: data.name,
          email: data.email,
          office_id: data.office_id,
          department_id: data.department_id,
          role_id: data.role_id,
          is_active: data.is_active,
          password_hash: passwordHash,
        },
        client
      );

      if (!updatedRow) {
        throw new Error('Failed to update user');
      }

      await auditLogsRepository.create(
        {
          actor_user_id: updaterUserId,
          action: data.is_active === false ? AuditAction.USER_DISABLED : AuditAction.USER_UPDATED,
          entity_type: 'user',
          entity_id: id,
          metadata: { updates: data },
        },
        client
      );

      return mapRowToUser(updatedRow);
    });
  }

  async enrollFace(
    actorUserId: string,
    userId: string,
    embedding: number[],
    modelName = '@vladmandic/human',
    modelVersion = '3.2.0',
    referenceImage?: string | null
  ): Promise<User> {
    const user = await usersRepository.findById(userId);
    if (!user) {
      const err = new Error('User not found');
      (err as any).code = ErrorCode.USER_NOT_FOUND;
      throw err;
    }

    const normalized = faceService.generateEmbedding(embedding);
    const wasAlreadyEnrolled = user.face_enrolled;

    return withTransaction(async (client) => {
      await faceTemplatesRepository.upsert(
        {
          user_id: userId,
          embedding: normalized,
          model_name: modelName,
          model_version: modelVersion,
          reference_image: referenceImage,
        },
        client
      );

      await usersRepository.setFaceEnrolled(userId, true, client);

      await auditLogsRepository.create(
        {
          actor_user_id: actorUserId,
          action: wasAlreadyEnrolled ? AuditAction.FACE_REPLACED : AuditAction.FACE_ENROLLED,
          entity_type: 'face_template',
          entity_id: userId,
          metadata: {
            employeeCode: user.employee_code,
            replaced: wasAlreadyEnrolled,
            modelName,
            hasReferenceImage: !!referenceImage,
          },
        },
        client
      );

      const refreshed = await usersRepository.findById(userId, client);
      if (!refreshed) throw new Error('Failed to load enrolled user');
      return mapRowToUser(refreshed);
    });
  }

  async getReferenceFace(userId: string): Promise<{ enrolled: boolean; referenceImage: string | null; embedding: number[] | null }> {
    const template = await faceTemplatesRepository.findByUserId(userId);
    return {
      enrolled: !!template,
      referenceImage: template?.reference_image || null,
      embedding: template?.embedding || null,
    };
  }
}

export const usersService = new UsersService();
