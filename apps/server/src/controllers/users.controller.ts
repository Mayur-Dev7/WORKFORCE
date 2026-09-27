import { Request, Response, NextFunction } from 'express';
import { usersService } from '../services/users.service.js';
import { CreateUserSchema, UpdateUserSchema, EnrollFaceSchema } from '../validators/index.js';
import { ErrorCode } from '@workforce/shared';

export class UsersController {
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { officeId, departmentId, roleId, isActive, search } = req.query;
      const users = await usersService.getAllUsers({
        companyId: req.user?.companyId,
        officeId: officeId as string | undefined,
        departmentId: departmentId as string | undefined,
        roleId: roleId as string | undefined,
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        search: search as string | undefined,
      });

      res.status(200).json({
        success: true,
        data: users,
      });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await usersService.getUserById(req.params.id);
      if (!user) {
        res.status(404).json({
          success: false,
          error: { code: ErrorCode.USER_NOT_FOUND, message: 'User not found' },
        });
        return;
      }
      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = CreateUserSchema.parse(req.body);
      const user = await usersService.createUser(req.user!.userId, validated);
      res.status(201).json({
        success: true,
        data: user,
      });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = UpdateUserSchema.parse(req.body);
      const updated = await usersService.updateUser(req.user!.userId, req.params.id, validated);
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  async enrollFace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = EnrollFaceSchema.parse(req.body);
      const user = await usersService.enrollFace(
        req.user!.userId,
        req.params.id,
        validated.embedding,
        validated.modelName,
        validated.modelVersion
      );
      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const usersController = new UsersController();
