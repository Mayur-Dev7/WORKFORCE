import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { withTransaction } from '../lib/db.js';
import { companiesRepository } from '../repositories/companies.repository.js';
import { officesRepository } from '../repositories/offices.repository.js';
import { companySettingsRepository } from '../repositories/companySettings.repository.js';
import { rolesRepository } from '../repositories/roles.repository.js';
import { usersRepository } from '../repositories/users.repository.js';
import { auditLogsRepository } from '../repositories/auditLogs.repository.js';
import { usersService } from '../services/users.service.js';
import { authService } from '../services/auth.service.js';
import { ErrorCode, RoleName, AuditAction } from '@workforce/shared';

const CreateCompanySchema = z.object({
  name: z.string().min(2, 'Company name must be at least 2 characters').max(100),
  officeName: z.string().min(2).max(100).optional(),
  address: z.string().max(255).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusMeters: z.number().min(10).max(10000).optional(),
  work_start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional(),
  work_end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional(),
  weekly_off_days: z.array(z.number().int().min(0).max(6)).optional(),
  casual_leaves_per_year: z.number().min(0).max(100).optional(),
  sick_leaves_per_year: z.number().min(0).max(100).optional(),
});

const UpdateSettingsSchema = z.object({
  work_start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional(),
  work_end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional(),
  grace_minutes: z.number().int().min(0).max(120).optional(),
  timezone: z.string().min(2).max(50).optional(),
  weekly_off_days: z.array(z.number().int().min(0).max(6)).optional(),
  casual_leaves_per_year: z.number().min(0).max(100).optional(),
  sick_leaves_per_year: z.number().min(0).max(100).optional(),
  leave_year_start_month: z.number().int().min(1).max(12).optional(),
  extra_rules: z.record(z.unknown()).optional(),
});

export class CompaniesController {
  async createCompany(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
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
            message: 'You already belong to a company. Leave your current company to create a new one.',
          },
        });
        return;
      }

      const body = CreateCompanySchema.parse(req.body);

      const result = await withTransaction(async (client) => {
        // 1. Create company row
        const company = await companiesRepository.create(
          { name: body.name, owner_user_id: userId },
          client
        );

        // 2. Create primary office
        const office = await officesRepository.create(
          {
            company_id: company.id,
            name: body.officeName || 'Headquarters',
            address: body.address || null,
            latitude: body.latitude ?? 12.9716, // Default Bangalore coordinates if not provided
            longitude: body.longitude ?? 77.5946,
            radius_meters: body.radiusMeters ?? 200,
          },
          client
        );

        // 3. Initialize default company settings
        await companySettingsRepository.createDefault(company.id, client);
        if (
          body.work_start_time ||
          body.work_end_time ||
          body.weekly_off_days ||
          body.casual_leaves_per_year !== undefined ||
          body.sick_leaves_per_year !== undefined
        ) {
          await companySettingsRepository.update(
            company.id,
            {
              work_start_time: body.work_start_time,
              work_end_time: body.work_end_time,
              weekly_off_days: body.weekly_off_days,
              casual_leaves_per_year: body.casual_leaves_per_year,
              sick_leaves_per_year: body.sick_leaves_per_year,
            },
            client
          );
        }

        // 4. Resolve COMPANY_ADMIN role
        const role = await rolesRepository.findByName(RoleName.COMPANY_ADMIN);
        if (!role) {
          throw new Error('COMPANY_ADMIN role not found');
        }

        // 5. Assign user as owner / admin of the company
        const updatedUser = await usersRepository.assignToCompany(
          userId,
          {
            company_id: company.id,
            office_id: office.id,
            role_id: role.id,
            employee_code: 'ADM-001',
          },
          client
        );

        // 6. Audit log
        await auditLogsRepository.create(
          {
            company_id: company.id,
            actor_user_id: userId,
            action: AuditAction.COMPANY_CREATED,
            entity_type: 'company',
            entity_id: company.id,
            metadata: {
              name: company.name,
              office_id: office.id,
            },
          },
          client
        );

        return { company, user: updatedUser };
      });

      // Issue new session tokens reflecting the new company and role
      const session = await authService.issueSession(result.user, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.cookie('refreshToken', session.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(201).json({
        success: true,
        data: {
          company: result.company,
          user: session.user,
          accessToken: session.accessToken,
        },
      });
    } catch (err: any) {
      if (err.code === '23505' && (err.constraint === 'uq_companies_name' || err.message?.includes('uq_companies_name'))) {
        res.status(409).json({
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'A company with this name already exists',
          },
        });
        return;
      }
      next(err);
    }
  }

  async leaveCompany(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: ErrorCode.UNAUTHORIZED, message: 'Authentication required' },
        });
        return;
      }

      await usersService.leaveCompany(userId);

      // Issue fresh session with company_id: null
      const refreshedUser = await usersRepository.findById(userId);
      if (!refreshedUser) {
        throw new Error('User not found after leaving company');
      }

      const session = await authService.issueSession(refreshedUser, {
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
          message: 'Left company successfully',
          user: session.user,
          accessToken: session.accessToken,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async getSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        res.status(403).json({
          success: false,
          error: { code: ErrorCode.USER_NOT_IN_COMPANY, message: 'No company associated with user' },
        });
        return;
      }

      const settings = await companySettingsRepository.findByCompanyId(companyId);
      if (!settings) {
        const created = await companySettingsRepository.createDefault(companyId);
        res.status(200).json({ success: true, data: created });
        return;
      }

      res.status(200).json({
        success: true,
        data: settings,
      });
    } catch (err) {
      next(err);
    }
  }

  async updateSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        res.status(403).json({
          success: false,
          error: { code: ErrorCode.USER_NOT_IN_COMPANY, message: 'No company associated with user' },
        });
        return;
      }

      if (req.user?.roleName !== RoleName.COMPANY_ADMIN && req.user?.roleName !== RoleName.SUPER_ADMIN) {
        res.status(403).json({
          success: false,
          error: { code: ErrorCode.PERMISSION_DENIED, message: 'Only a Company Admin can modify company settings' },
        });
        return;
      }

      const dto = UpdateSettingsSchema.parse(req.body);
      const updated = await companySettingsRepository.update(companyId, dto);

      await auditLogsRepository.create({
        company_id: companyId,
        actor_user_id: req.user!.userId,
        action: AuditAction.COMPANY_SETTINGS_UPDATED,
        entity_type: 'company_settings',
        entity_id: companyId,
        metadata: { updates: dto },
      });

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const companiesController = new CompaniesController();
