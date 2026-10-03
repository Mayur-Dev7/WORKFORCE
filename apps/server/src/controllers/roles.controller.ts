import { Request, Response, NextFunction } from 'express';
import { rolesRepository } from '../repositories/roles.repository.js';
import { permissionsRepository } from '../repositories/permissions.repository.js';
import { auditLogsRepository } from '../repositories/auditLogs.repository.js';
import { UpdateRolePermissionsSchema } from '../validators/index.js';
import { AuditAction, RoleName, ErrorCode } from '@workforce/shared';

export class RolesController {
  async getRoles(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roles = await rolesRepository.findAll();
      res.status(200).json({
        success: true,
        data: roles,
      });
    } catch (err) {
      next(err);
    }
  }

  async getPermissions(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const permissions = await permissionsRepository.findAll();
      res.status(200).json({
        success: true,
        data: permissions,
      });
    } catch (err) {
      next(err);
    }
  }

  async updateRolePermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const role = await rolesRepository.findById(req.params.id);
      if (!role) {
        res.status(404).json({
          success: false,
          error: { code: ErrorCode.VALIDATION_ERROR, message: 'Role not found' },
        });
        return;
      }

      if (role.name === RoleName.COMPANY_ADMIN || (role.name as string) === 'SUPER_ADMIN') {
        res.status(403).json({
          success: false,
          error: {
            code: ErrorCode.PERMISSION_DENIED,
            message: 'Cannot modify permissions for the superior Company Admin role',
          },
        });
        return;
      }

      const validated = UpdateRolePermissionsSchema.parse(req.body);
      await rolesRepository.updateRolePermissions(req.params.id, validated.permissions);

      await auditLogsRepository.create({
        actor_user_id: req.user!.userId,
        action: AuditAction.ROLE_CHANGED,
        entity_type: 'role',
        entity_id: req.params.id,
        metadata: { permissions: validated.permissions },
      });

      const updated = await rolesRepository.findById(req.params.id);
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const rolesController = new RolesController();
