import { Request, Response, NextFunction } from 'express';
import { usersService } from '../services/users.service.js';
import { CreateUserSchema, UpdateUserSchema, EnrollFaceSchema } from '../validators/index.js';
import { ErrorCode } from '@workforce/shared';

export class UsersController {
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { officeId, departmentId, roleId, isActive, search } = req.query;
      const users = await usersService.getAllUsers({
        companyId: req.user?.companyId || undefined,
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
      const user = await usersService.getUserById(req.params.id, req.user?.companyId || undefined);
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
        validated.modelVersion,
        validated.referenceImage
      );
      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (err) {
      next(err);
    }
  }

  async enrollSelfFace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = EnrollFaceSchema.parse(req.body);
      const user = await usersService.enrollFace(
        req.user!.userId,
        req.user!.userId,
        validated.embedding,
        validated.modelName,
        validated.modelVersion,
        validated.referenceImage
      );
      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (err) {
      next(err);
    }
  }

  async getSelfFaceTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const faceData = await usersService.getReferenceFace(req.user!.userId);
      res.status(200).json({
        success: true,
        data: faceData,
      });
    } catch (err) {
      next(err);
    }
  }

  async removeEmployee(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await usersService.removeUserFromCompany(req.user!.userId, req.params.id);
      res.status(200).json({
        success: true,
        data: { message: 'User removed from company successfully' },
      });
    } catch (err) {
      next(err);
    }
  }

  async leaveCompany(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await usersService.leaveCompany(req.user!.userId);
      res.status(200).json({
        success: true,
        data: { message: 'You have left the company successfully' },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const usersController = new UsersController();
