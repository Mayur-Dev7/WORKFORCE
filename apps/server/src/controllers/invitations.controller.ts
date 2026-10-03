import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { withTransaction } from '../lib/db.js';
import { invitationsRepository } from '../repositories/invitations.repository.js';
import { usersRepository } from '../repositories/users.repository.js';
import { rolesRepository } from '../repositories/roles.repository.js';
import { officesRepository } from '../repositories/offices.repository.js';
import { departmentsRepository } from '../repositories/departments.repository.js';
import { auditLogsRepository } from '../repositories/auditLogs.repository.js';
import { authService } from '../services/auth.service.js';
import { ErrorCode, RoleName, AuditAction } from '@workforce/shared';

const CreateInvitationSchema = z.object({
  email: z.string().email(),
  role_id: z.string().uuid(),
  department_id: z.string().uuid().optional().nullable(),
  office_id: z.string().uuid().optional().nullable(),
});

export class InvitationsController {
  async listCompanyInvitations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        res.status(403).json({
          success: false,
          error: { code: ErrorCode.USER_NOT_IN_COMPANY, message: 'User must belong to a company' },
        });
        return;
      }

      const status = req.query.status as any;
      const invitations = await invitationsRepository.findByCompany(companyId, status);
      res.status(200).json({
        success: true,
        data: invitations,
      });
    } catch (err) {
      next(err);
    }
  }

  async createInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user?.companyId;
      const userId = req.user?.userId;
      if (!companyId || !userId) {
        res.status(403).json({
          success: false,
          error: { code: ErrorCode.USER_NOT_IN_COMPANY, message: 'User must belong to a company' },
        });
        return;
      }

      const body = CreateInvitationSchema.parse(req.body);
      const email = body.email.trim().toLowerCase();

      // Check role
      const role = await rolesRepository.findById(body.role_id);
      if (!role) {
        res.status(400).json({
          success: false,
          error: { code: ErrorCode.VALIDATION_ERROR, message: 'Invalid role specified' },
        });
        return;
      }

      if (role.name === RoleName.SUPER_ADMIN) {
        res.status(403).json({
          success: false,
          error: { code: ErrorCode.CANNOT_ASSIGN_SUPER_ADMIN, message: 'Cannot invite a user as Super Admin' },
        });
        return;
      }

      if (role.name === RoleName.COMPANY_ADMIN && req.user?.roleName !== RoleName.COMPANY_ADMIN) {
        res.status(403).json({
          success: false,
          error: { code: ErrorCode.PERMISSION_DENIED, message: 'Only a Company Admin can invite another Company Admin' },
        });
        return;
      }

      // Check office & department scoping
      if (body.office_id) {
        const office = await officesRepository.findById(body.office_id, undefined, companyId);
        if (!office) {
          res.status(400).json({
            success: false,
            error: { code: ErrorCode.VALIDATION_ERROR, message: 'Office does not belong to your company' },
          });
          return;
        }
      }

      if (body.department_id) {
        const dept = await departmentsRepository.findById(body.department_id, undefined, companyId);
        if (!dept) {
          res.status(400).json({
            success: false,
            error: { code: ErrorCode.VALIDATION_ERROR, message: 'Department does not belong to your company' },
          });
          return;
        }
      }

      // Check if user already in company
      const existingUser = await usersRepository.findByEmail(email);
      if (existingUser && existingUser.company_id === companyId) {
        res.status(400).json({
          success: false,
          error: { code: ErrorCode.USER_ALREADY_IN_COMPANY, message: 'This user is already a member of your company' },
        });
        return;
      }

      // Check if pending invitation already exists in this company
      const existingInv = await invitationsRepository.findPendingByCompanyAndEmail(companyId, email);
      if (existingInv) {
        res.status(200).json({
          success: true,
          data: existingInv,
        });
        return;
      }

      const invitation = await invitationsRepository.create({
        company_id: companyId,
        email,
        role_id: body.role_id,
        department_id: body.department_id || null,
        office_id: body.office_id || null,
        invited_by: userId,
      });

      await auditLogsRepository.create({
        company_id: companyId,
        actor_user_id: userId,
        action: AuditAction.INVITATION_SENT,
        entity_type: 'invitation',
        entity_id: invitation.id,
        metadata: {
          email,
          role_name: role.name,
        },
      });

      res.status(201).json({
        success: true,
        data: invitation,
      });
    } catch (err) {
      next(err);
    }
  }

  async listMyInvitations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const email = req.user?.email;
      if (!email) {
        res.status(401).json({
          success: false,
          error: { code: ErrorCode.UNAUTHORIZED, message: 'Authentication required' },
        });
        return;
      }

      const invitations = await invitationsRepository.findPendingByEmail(email);
      res.status(200).json({
        success: true,
        data: invitations,
      });
    } catch (err) {
      next(err);
    }
  }

  async acceptInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const userEmail = req.user?.email;
      if (!userId || !userEmail) {
        res.status(401).json({
          success: false,
          error: { code: ErrorCode.UNAUTHORIZED, message: 'Authentication required' },
        });
        return;
      }

      if (req.user?.companyId) {
        res.status(400).json({
          success: false,
          error: {
            code: ErrorCode.USER_ALREADY_IN_COMPANY,
            message: 'You already belong to a company. Leave your current company first before accepting an invitation.',
          },
        });
        return;
      }

      const invitation = await invitationsRepository.findById(req.params.id);
      if (!invitation) {
        res.status(404).json({
          success: false,
          error: { code: ErrorCode.INVITATION_NOT_FOUND, message: 'Invitation not found' },
        });
        return;
      }

      if (invitation.status !== 'pending' || new Date(invitation.expires_at) < new Date()) {
        res.status(400).json({
          success: false,
          error: { code: ErrorCode.INVITATION_EXPIRED, message: 'Invitation is expired or already resolved' },
        });
        return;
      }

      if (invitation.email.toLowerCase() !== userEmail.toLowerCase()) {
        res.status(403).json({
          success: false,
          error: { code: ErrorCode.FORBIDDEN, message: 'This invitation was addressed to a different email address' },
        });
        return;
      }

      const updatedUser = await withTransaction(async (client) => {
        // Resolve office (use invitation office or company primary office)
        let officeId = invitation.office_id;
        if (!officeId) {
          const offices = await officesRepository.findAll(invitation.company_id);
          const primary = offices.find((o) => o.is_active) || offices[0];
          if (!primary) {
            throw new Error('Target company has no active office');
          }
          officeId = primary.id;
        }

        // Generate employee code
        const code = `EMP-${Date.now().toString().slice(-4)}`;

        const user = await usersRepository.assignToCompany(
          userId,
          {
            company_id: invitation.company_id,
            office_id: officeId,
            role_id: invitation.role_id,
            department_id: invitation.department_id || null,
            employee_code: code,
          },
          client
        );

        await invitationsRepository.markAccepted(invitation.id, userId, client);

        await auditLogsRepository.create(
          {
            company_id: invitation.company_id,
            actor_user_id: userId,
            action: AuditAction.INVITATION_ACCEPTED,
            entity_type: 'invitation',
            entity_id: invitation.id,
            metadata: {
              company_id: invitation.company_id,
              role_id: invitation.role_id,
            },
          },
          client
        );

        return user;
      });

      const session = await authService.issueSession(updatedUser, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.cookie('refreshToken', session.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(200).json({
        success: true,
        data: {
          user: session.user,
          accessToken: session.accessToken,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async declineInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userEmail = req.user?.email;
      const invitation = await invitationsRepository.findById(req.params.id);
      if (!invitation) {
        res.status(404).json({
          success: false,
          error: { code: ErrorCode.INVITATION_NOT_FOUND, message: 'Invitation not found' },
        });
        return;
      }

      if (invitation.email.toLowerCase() !== userEmail?.toLowerCase()) {
        res.status(403).json({
          success: false,
          error: { code: ErrorCode.FORBIDDEN, message: 'Cannot decline someone else invitation' },
        });
        return;
      }

      await invitationsRepository.markStatus(invitation.id, 'revoked');
      res.status(200).json({
        success: true,
        data: { message: 'Invitation declined' },
      });
    } catch (err) {
      next(err);
    }
  }

  async revokeInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user?.companyId;
      const invitation = await invitationsRepository.findById(req.params.id);
      if (!invitation || invitation.company_id !== companyId) {
        res.status(404).json({
          success: false,
          error: { code: ErrorCode.INVITATION_NOT_FOUND, message: 'Invitation not found in your company' },
        });
        return;
      }

      await invitationsRepository.markStatus(invitation.id, 'revoked');

      await auditLogsRepository.create({
        company_id: companyId,
        actor_user_id: req.user!.userId,
        action: AuditAction.INVITATION_REVOKED,
        entity_type: 'invitation',
        entity_id: invitation.id,
      });

      res.status(200).json({
        success: true,
        data: { message: 'Invitation revoked' },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const invitationsController = new InvitationsController();
