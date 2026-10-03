import bcrypt from 'bcrypt';
import { withTransaction } from '../lib/db.js';
import { usersRepository, UserRow } from '../repositories/users.repository.js';
import { faceTemplatesRepository } from '../repositories/faceTemplates.repository.js';
import { auditLogsRepository } from '../repositories/auditLogs.repository.js';
import { companiesRepository } from '../repositories/companies.repository.js';
import { officesRepository } from '../repositories/offices.repository.js';
import { departmentsRepository } from '../repositories/departments.repository.js';
import { rolesRepository } from '../repositories/roles.repository.js';
import { attendanceRepository } from '../repositories/attendance.repository.js';
import { leaveRequestsRepository } from '../repositories/leaveRequests.repository.js';
import { faceService } from './face.service.js';
import { User, RoleName, PermissionKey, AuditAction, ErrorCode } from '@workforce/shared';
import { getIdentityProvisioner } from '../modules/firebase-auth/identity-provisioner.js';
import { getAuthProviderMode } from '../modules/firebase-auth/types.js';

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
    firebase_uid: row.firebase_uid,
    auth_provider: row.auth_provider,
    firebase_linked_at: row.firebase_linked_at ? row.firebase_linked_at.toISOString() : null,
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

  async getUserById(id: string, callerCompanyId?: string): Promise<User | null> {
    const row = await usersRepository.findById(id, undefined, callerCompanyId);
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
    const creator = await usersRepository.findById(creatorUserId);
    if (!creator || !creator.company_id) {
      const err = new Error('Creator must belong to a company');
      (err as any).code = ErrorCode.FORBIDDEN;
      throw err;
    }

    if (creator.company_id !== data.company_id) {
      const err = new Error('Cannot create users in another company');
      (err as any).code = ErrorCode.CROSS_TENANT_FORBIDDEN;
      throw err;
    }

    // Email collision check globally (never attach existing user without acceptance)
    const existingByEmail = await usersRepository.findByEmail(data.email);
    if (existingByEmail) {
      const err = new Error('A user with this email address already exists. Send an invitation instead.');
      (err as any).code = ErrorCode.VALIDATION_ERROR;
      throw err;
    }

    const existingByCode = await usersRepository.findByEmployeeCode(data.employee_code);
    if (existingByCode) {
      const err = new Error('Employee code already in use');
      (err as any).code = ErrorCode.VALIDATION_ERROR;
      throw err;
    }

    // Role validation
    const targetRole = await rolesRepository.findById(data.role_id);
    if (!targetRole) {
      const err = new Error('Invalid role specified');
      (err as any).code = ErrorCode.VALIDATION_ERROR;
      throw err;
    }
    if (targetRole.name === RoleName.SUPER_ADMIN) {
      const err = new Error('Assigning SUPER_ADMIN role is forbidden');
      (err as any).code = ErrorCode.CANNOT_ASSIGN_SUPER_ADMIN;
      throw err;
    }
    if (targetRole.name === RoleName.COMPANY_ADMIN && creator.role_name !== RoleName.COMPANY_ADMIN) {
      const err = new Error('Only a Company Admin can assign the Company Admin role');
      (err as any).code = ErrorCode.PERMISSION_DENIED;
      throw err;
    }

    // Office & Department scoping to company
    const office = await officesRepository.findById(data.office_id, undefined, creator.company_id);
    if (!office) {
      const err = new Error('Specified office does not belong to your company');
      (err as any).code = ErrorCode.VALIDATION_ERROR;
      throw err;
    }

    if (data.department_id) {
      const dept = await departmentsRepository.findById(data.department_id, undefined, creator.company_id);
      if (!dept) {
        const err = new Error('Specified department does not belong to your company');
        (err as any).code = ErrorCode.VALIDATION_ERROR;
        throw err;
      }
    }

    const mode = getAuthProviderMode();
    let passwordHash: string | undefined;
    if (mode === 'legacy') {
      passwordHash = await bcrypt.hash(data.password || 'Password123!', 10);
    } else if (data.password) {
      passwordHash = await bcrypt.hash(data.password, 10);
    }

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

      const provisioner = getIdentityProvisioner();
      const provisionResult = await provisioner.onUserCreated(
        {
          id: createdRow.id,
          email: createdRow.email,
          name: createdRow.name,
          employee_code: createdRow.employee_code || '',
        },
        client
      );

      await auditLogsRepository.create(
        {
          company_id: data.company_id,
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

      const refreshedRow = await usersRepository.findById(createdRow.id, client);
      const user = mapRowToUser(refreshedRow || createdRow);
      if (provisionResult?.passwordResetLink) {
        user.password_reset_link = provisionResult.passwordResetLink;
      }
      return user;
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
    const updater = await usersRepository.findById(updaterUserId);
    if (!updater || !updater.company_id) {
      const err = new Error('Updater does not belong to a company');
      (err as any).code = ErrorCode.FORBIDDEN;
      throw err;
    }

    const existing = await usersRepository.findById(id, undefined, updater.company_id);
    if (!existing) {
      const err = new Error('User not found in your company');
      (err as any).code = ErrorCode.USER_NOT_FOUND;
      throw err;
    }

    // Role change validation
    if (data.role_id && data.role_id !== existing.role_id) {
      const targetRole = await rolesRepository.findById(data.role_id);
      if (!targetRole) {
        const err = new Error('Invalid role specified');
        (err as any).code = ErrorCode.VALIDATION_ERROR;
        throw err;
      }
      if (targetRole.name === RoleName.SUPER_ADMIN) {
        const err = new Error('Assigning SUPER_ADMIN role is forbidden');
        (err as any).code = ErrorCode.CANNOT_ASSIGN_SUPER_ADMIN;
        throw err;
      }
      if (targetRole.name === RoleName.COMPANY_ADMIN && updater.role_name !== RoleName.COMPANY_ADMIN) {
        const err = new Error('Only a Company Admin can assign the Company Admin role');
        (err as any).code = ErrorCode.PERMISSION_DENIED;
        throw err;
      }
    }

    if (data.office_id) {
      const office = await officesRepository.findById(data.office_id, undefined, updater.company_id);
      if (!office) {
        const err = new Error('Office not found in your company');
        (err as any).code = ErrorCode.VALIDATION_ERROR;
        throw err;
      }
    }

    if (data.department_id) {
      const dept = await departmentsRepository.findById(data.department_id, undefined, updater.company_id);
      if (!dept) {
        const err = new Error('Department not found in your company');
        (err as any).code = ErrorCode.VALIDATION_ERROR;
        throw err;
      }
    }

    let passwordHash: string | undefined;
    if (data.password) {
      passwordHash = await bcrypt.hash(data.password, 10);
    }

    // Call identity provisioner hooks before DB update
    const provisioner = getIdentityProvisioner();
    if (data.is_active !== undefined && data.is_active !== existing.is_active) {
      if (data.is_active === false) {
        await provisioner.onUserDisabled(id, existing.firebase_uid);
      } else {
        await provisioner.onUserEnabled(id, existing.firebase_uid);
      }
    }

    if (data.email && data.email.trim().toLowerCase() !== existing.email.toLowerCase()) {
      await provisioner.onEmailChanged(id, data.email, existing.firebase_uid);
    }

    return withTransaction(async (client) => {
      // Sole-admin race protection if demoting a COMPANY_ADMIN
      if (
        existing.role_name === RoleName.COMPANY_ADMIN &&
        data.role_id &&
        data.role_id !== existing.role_id
      ) {
        await companiesRepository.lockAdmins(updater.company_id!, client);
        const adminCount = await companiesRepository.countActiveAdmins(updater.company_id!, client);
        if (adminCount <= 1) {
          const err = new Error('Cannot demote the sole Company Admin. Promote another admin first.');
          (err as any).code = ErrorCode.SOLE_ADMIN_CANNOT_LEAVE;
          throw err;
        }
      }

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

      // If role or active status changed, increment token version to immediately invalidate stale tokens
      if (
        (data.role_id && data.role_id !== existing.role_id) ||
        (data.is_active !== undefined && data.is_active !== existing.is_active)
      ) {
        await usersRepository.incrementTokenVersion(id, client);
      }

      await auditLogsRepository.create(
        {
          company_id: updater.company_id,
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

  async removeUserFromCompany(adminUserId: string, targetUserId: string): Promise<void> {
    const admin = await usersRepository.findById(adminUserId);
    if (!admin || !admin.company_id) {
      const err = new Error('Admin must belong to a company');
      (err as any).code = ErrorCode.FORBIDDEN;
      throw err;
    }

    const target = await usersRepository.findById(targetUserId, undefined, admin.company_id);
    if (!target) {
      const err = new Error('User not found in your company');
      (err as any).code = ErrorCode.USER_NOT_FOUND;
      throw err;
    }

    await withTransaction(async (client) => {
      // Sole-admin race protection
      await companiesRepository.lockAdmins(admin.company_id!, client);
      if (target.role_name === RoleName.COMPANY_ADMIN) {
        if (admin.role_name !== RoleName.COMPANY_ADMIN) {
          const err = new Error('Only a Company Admin can remove another Company Admin');
          (err as any).code = ErrorCode.PERMISSION_DENIED;
          throw err;
        }
        const adminCount = await companiesRepository.countActiveAdmins(admin.company_id!, client);
        if (adminCount <= 1) {
          const err = new Error('Cannot remove the sole Company Admin. Promote another admin first.');
          (err as any).code = ErrorCode.SOLE_ADMIN_CANNOT_LEAVE;
          throw err;
        }
      }

      // 1. Cancel pending leave requests
      await leaveRequestsRepository.cancelPendingByUserId(targetUserId, client);

      // 2. Auto-close any active attendance session with auto_closed=true and reason='removed'
      await attendanceRepository.autoCloseOpenSessionsForUser(targetUserId, 'removed', client);

      // 3. Delete biometric face template and clear face_enrolled
      await faceTemplatesRepository.deleteByUserId(targetUserId, client);
      await usersRepository.setFaceEnrolled(targetUserId, false, client);

      // 4. Audit log (written with company_id explicitly before detaching user)
      await auditLogsRepository.create(
        {
          company_id: admin.company_id,
          actor_user_id: adminUserId,
          action: AuditAction.USER_REMOVED_FROM_COMPANY,
          entity_type: 'user',
          entity_id: targetUserId,
          metadata: {
            removed_user_id: targetUserId,
            email: target.email,
            previous_role: target.role_name,
          },
        },
        client
      );

      // 5. Detach user from company and increment token_version (revokes active session)
      await usersRepository.detachFromCompany(targetUserId, client);
    });
  }

  async leaveCompany(userId: string): Promise<void> {
    const user = await usersRepository.findById(userId);
    if (!user || !user.company_id) {
      const err = new Error('User does not belong to any company');
      (err as any).code = ErrorCode.USER_NOT_IN_COMPANY;
      throw err;
    }

    const companyId = user.company_id;

    await withTransaction(async (client) => {
      // Sole-admin race protection
      await companiesRepository.lockAdmins(companyId, client);
      if (user.role_name === RoleName.COMPANY_ADMIN) {
        const adminCount = await companiesRepository.countActiveAdmins(companyId, client);
        if (adminCount <= 1) {
          const err = new Error('The sole Company Admin cannot leave the company. Transfer ownership or promote another admin first.');
          (err as any).code = ErrorCode.SOLE_ADMIN_CANNOT_LEAVE;
          throw err;
        }
      }

      // 1. Cancel pending leave requests
      await leaveRequestsRepository.cancelPendingByUserId(userId, client);

      // 2. Auto-close any active attendance session with auto_closed=true and reason='left_company'
      await attendanceRepository.autoCloseOpenSessionsForUser(userId, 'left_company', client);

      // 3. Delete biometric face template and clear face_enrolled
      await faceTemplatesRepository.deleteByUserId(userId, client);
      await usersRepository.setFaceEnrolled(userId, false, client);

      // 4. Audit log (written with company_id explicitly before detaching user)
      await auditLogsRepository.create(
        {
          company_id: companyId,
          actor_user_id: userId,
          action: AuditAction.USER_LEFT_COMPANY,
          entity_type: 'user',
          entity_id: userId,
          metadata: {
            user_id: userId,
            email: user.email,
            previous_role: user.role_name,
          },
        },
        client
      );

      // 5. Detach user from company and increment token_version
      await usersRepository.detachFromCompany(userId, client);
    });
  }

  async deleteUser(id: string): Promise<void> {
    const existing = await usersRepository.findById(id);
    if (!existing) return;
    const provisioner = getIdentityProvisioner();
    await provisioner.onUserDeleted(id, existing.firebase_uid);
  }


  async enrollFace(
    actorUserId: string,
    userId: string,
    embedding: number[],
    modelName = '@vladmandic/human',
    modelVersion = '3.2.0',
    referenceImage?: string | null
  ): Promise<User> {
    const actor = await usersRepository.findById(actorUserId);
    if (!actor || !actor.company_id) {
      const err = new Error('Actor must belong to a company');
      (err as any).code = ErrorCode.FORBIDDEN;
      throw err;
    }

    const user = await usersRepository.findById(userId, undefined, actor.company_id);
    if (!user) {
      const err = new Error('User not found in your company');
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
          company_id: actor.company_id,
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
