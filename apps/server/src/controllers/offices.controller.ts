import { Request, Response, NextFunction } from 'express';
import { officesService } from '../services/offices.service.js';
import { CreateOfficeSchema, UpdateOfficeSchema } from '../validators/index.js';
import { ErrorCode } from '@workforce/shared';

export class OfficesController {
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const offices = await officesService.getAll(req.user?.companyId || undefined);
      res.status(200).json({
        success: true,
        data: offices,
      });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const office = await officesService.getById(req.params.id, req.user?.companyId || undefined);
      if (!office) {
        res.status(404).json({
          success: false,
          error: { code: ErrorCode.VALIDATION_ERROR, message: 'Office not found' },
        });
        return;
      }
      res.status(200).json({
        success: true,
        data: office,
      });
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = CreateOfficeSchema.parse(req.body);
      const companyId = req.user?.companyId || validated.company_id;
      if (!companyId) {
        res.status(400).json({
          success: false,
          error: { code: ErrorCode.VALIDATION_ERROR, message: 'company_id is required' },
        });
        return;
      }
      if (req.user?.companyId && validated.company_id && validated.company_id !== req.user.companyId) {
        res.status(403).json({
          success: false,
          error: { code: ErrorCode.CROSS_TENANT_FORBIDDEN, message: 'Cannot create offices in another company' },
        });
        return;
      }
      const office = await officesService.create(req.user!.userId, {
        ...validated,
        company_id: companyId,
      });
      res.status(201).json({
        success: true,
        data: office,
      });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = UpdateOfficeSchema.parse(req.body);
      const office = await officesService.update(
        req.user!.userId,
        req.params.id,
        validated,
        req.user?.companyId || undefined
      );
      res.status(200).json({
        success: true,
        data: office,
      });
    } catch (err) {
      next(err);
    }
  }

  async applyToAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user!.companyId;
      if (!companyId) {
        res.status(400).json({
          success: false,
          error: { code: ErrorCode.VALIDATION_ERROR, message: 'Company ID required' },
        });
        return;
      }
      const result = await officesService.applyToAllCompanyEmployees(
        req.user!.userId,
        companyId,
        req.params.id
      );
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deleted = await officesService.delete(
        req.user!.userId,
        req.params.id,
        req.user?.companyId || undefined
      );
      res.status(200).json({
        success: true,
        data: { deleted },
      });
    } catch (err: any) {
      if (err.statusCode) {
        res.status(err.statusCode).json({
          success: false,
          error: { code: ErrorCode.VALIDATION_ERROR, message: err.message },
        });
        return;
      }
      next(err);
    }
  }
}

export const officesController = new OfficesController();
