import { Request, Response, NextFunction } from 'express';
import { reportsService } from '../services/reports.service.js';
import { ReportQuerySchema } from '../validators/index.js';

export class ReportsController {
  async getAttendanceReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = ReportQuerySchema.parse(req.query);
      const items = await reportsService.getAttendanceReport(filters);
      res.status(200).json({
        success: true,
        data: items,
      });
    } catch (err) {
      next(err);
    }
  }

  async exportAttendanceReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = ReportQuerySchema.parse(req.query);
      const items = await reportsService.getAttendanceReport(filters);
      const csv = reportsService.generateCsv(items);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="attendance-report-${Date.now()}.csv"`);
      res.status(200).send(csv);
    } catch (err) {
      next(err);
    }
  }

  async getAdminStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user!.companyId;
      const stats = await reportsService.getAdminStats(companyId);
      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const reportsController = new ReportsController();
