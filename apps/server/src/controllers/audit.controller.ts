import { Request, Response, NextFunction } from 'express';
import { auditService } from '../services/audit.service.js';
import { loginAttemptsRepository } from '../repositories/loginAttempts.repository.js';

export class AuditController {
  async getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { action, entityType, actorUserId, limit, offset } = req.query;
      const result = await auditService.getAuditLogs({
        companyId: req.user?.companyId || undefined,
        action: action as string | undefined,
        entityType: entityType as string | undefined,
        actorUserId: actorUserId as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : 50,
        offset: offset ? parseInt(offset as string, 10) : 0,
      });

      res.status(200).json({
        success: true,
        data: result.logs,
        meta: { total: result.total },
      });
    } catch (err) {
      next(err);
    }
  }

  async getLoginAttempts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const attempts = await loginAttemptsRepository.findAll(limit, req.user?.companyId || undefined);
      res.status(200).json({
        success: true,
        data: attempts,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const auditController = new AuditController();
