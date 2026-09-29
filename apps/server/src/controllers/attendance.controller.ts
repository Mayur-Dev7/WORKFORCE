import { Request, Response, NextFunction } from 'express';
import { attendanceService } from '../services/attendance.service.js';
import { CheckInSchema, CheckOutSchema } from '../validators/index.js';

export class AttendanceController {
  async checkIn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = CheckInSchema.parse(req.body);
      const session = await attendanceService.processCheckIn(validated, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      res.status(200).json({
        success: true,
        data: session,
      });
    } catch (err) {
      next(err);
    }
  }

  async checkOut(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = CheckOutSchema.parse(req.body);
      const session = await attendanceService.processCheckOut(validated, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      res.status(200).json({
        success: true,
        data: session,
      });
    } catch (err) {
      next(err);
    }
  }

  async getActiveSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const session = await attendanceService.getActiveSession(req.user!.userId);
      res.status(200).json({
        success: true,
        data: session,
      });
    } catch (err) {
      next(err);
    }
  }

  async getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const month = req.query.month as string | undefined;
      const history = await attendanceService.getUserHistory(req.user!.userId, limit, month);
      res.status(200).json({
        success: true,
        data: history,
      });
    } catch (err) {
      next(err);
    }
  }

  async getTeamAttendance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const officeId = req.query.officeId as string | undefined;
      const departmentId = req.query.departmentId as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

      const sessions = await attendanceService.getTeamAttendance(officeId, departmentId, limit);
      res.status(200).json({
        success: true,
        data: sessions,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const attendanceController = new AttendanceController();
