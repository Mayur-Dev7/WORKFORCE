import { Request, Response, NextFunction } from 'express';
import { shiftsService } from '../services/shifts.service.js';
import { usersRepository } from '../repositories/users.repository.js';
import { CreateShiftSchema, UpdateShiftSchema } from '../validators/shift.validators.js';
import { ErrorCode } from '@workforce/shared';

export class ShiftsController {
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        res.status(400).json({
          success: false,
          error: { code: ErrorCode.VALIDATION_ERROR, message: 'Company ID missing from session' },
        });
        return;
      }
      const shifts = await shiftsService.getAll(companyId);
      res.status(200).json({
        success: true,
        data: shifts,
      });
    } catch (err) {
      next(err);
    }
  }

  async getCurrent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const companyId = req.user?.companyId;
      if (!userId || !companyId) {
        res.status(401).json({
          success: false,
          error: { code: ErrorCode.UNAUTHORIZED, message: 'User not authenticated' },
        });
        return;
      }

      // Find user to know their assigned office
      const user = await usersRepository.findById(userId);
      const shift = await shiftsService.getCurrentShiftForUser(companyId, user?.office_id);

      res.status(200).json({
        success: true,
        data: shift,
      });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shift = await shiftsService.getById(req.params.id);
      if (!shift) {
        res.status(404).json({
          success: false,
          error: { code: ErrorCode.VALIDATION_ERROR, message: 'Work shift not found' },
        });
        return;
      }
      res.status(200).json({
        success: true,
        data: shift,
      });
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        res.status(400).json({
          success: false,
          error: { code: ErrorCode.VALIDATION_ERROR, message: 'Company ID missing from session' },
        });
        return;
      }

      const validated = CreateShiftSchema.parse(req.body);
      const shift = await shiftsService.create(req.user!.userId, companyId, validated);

      res.status(201).json({
        success: true,
        data: shift,
      });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = UpdateShiftSchema.parse(req.body);
      const shift = await shiftsService.update(req.user!.userId, req.params.id, validated);
      if (!shift) {
        res.status(404).json({
          success: false,
          error: { code: ErrorCode.VALIDATION_ERROR, message: 'Work shift not found' },
        });
        return;
      }
      res.status(200).json({
        success: true,
        data: shift,
      });
    } catch (err) {
      next(err);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deleted = await shiftsService.delete(req.user!.userId, req.params.id);
      if (!deleted) {
        res.status(404).json({
          success: false,
          error: { code: ErrorCode.VALIDATION_ERROR, message: 'Work shift not found' },
        });
        return;
      }
      res.status(200).json({
        success: true,
        data: { deleted: true },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const shiftsController = new ShiftsController();
