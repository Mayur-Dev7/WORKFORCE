import { Request, Response, NextFunction } from 'express';
import { officesService } from '../services/offices.service.js';
import { CreateOfficeSchema, UpdateOfficeSchema } from '../validators/index.js';
import { ErrorCode } from '@workforce/shared';

export class OfficesController {
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const offices = await officesService.getAll(req.user?.companyId);
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
      const office = await officesService.getById(req.params.id);
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
      const office = await officesService.create(req.user!.userId, validated);
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
      const office = await officesService.update(req.user!.userId, req.params.id, validated);
      res.status(200).json({
        success: true,
        data: office,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const officesController = new OfficesController();
