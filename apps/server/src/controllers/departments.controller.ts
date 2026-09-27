import { Request, Response, NextFunction } from 'express';
import { departmentsService } from '../services/departments.service.js';
import { CreateDepartmentSchema, UpdateDepartmentSchema } from '../validators/index.js';
import { ErrorCode } from '@workforce/shared';

export class DepartmentsController {
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const departments = await departmentsService.getAll(req.user?.companyId);
      res.status(200).json({
        success: true,
        data: departments,
      });
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = CreateDepartmentSchema.parse(req.body);
      const department = await departmentsService.create(validated);
      res.status(201).json({
        success: true,
        data: department,
      });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = UpdateDepartmentSchema.parse(req.body);
      const updated = await departmentsService.update(req.params.id, validated.name);
      if (!updated) {
        res.status(404).json({
          success: false,
          error: { code: ErrorCode.VALIDATION_ERROR, message: 'Department not found' },
        });
        return;
      }
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const departmentsController = new DepartmentsController();
