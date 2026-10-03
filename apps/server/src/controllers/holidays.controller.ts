import { Request, Response } from 'express';
import { holidayService } from '../services/holiday.service.js';
import {
  CreateHolidaySchema,
  UpdateHolidaySchema,
  HolidayQuerySchema,
  UpsertWeeklyRuleSchema,
  BatchWeeklyRulesSchema,
} from '../validators/holiday.validators.js';
import { ErrorCode } from '@workforce/shared';
import { ZodError } from 'zod';

function sendValidationError(res: Response, error: ZodError) {
  res.status(400).json({
    success: false,
    error: {
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Validation failed',
      details: error.flatten().fieldErrors,
    },
  });
}

export class HolidaysController {
  // ─── Holidays ─────────────────────────────────────────────────────────────

  getHolidays = async (req: Request, res: Response): Promise<void> => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        res.status(403).json({ success: false, error: { code: ErrorCode.USER_NOT_IN_COMPANY, message: 'User must belong to a company' } });
        return;
      }
      const q = HolidayQuerySchema.safeParse(req.query);
      if (!q.success) { sendValidationError(res, q.error); return; }

      const holidays = await holidayService.getHolidaysForCompany(
        companyId,
        {
          year: q.data.year,
          officeId: q.data.office_id,
          activeOnly: true,
        }
      );
      res.json({ success: true, data: holidays });
    } catch (err) {
      console.error('[HolidaysController.getHolidays]', err);
      res.status(500).json({ success: false, error: { code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Internal server error' } });
    }
  };

  createHoliday = async (req: Request, res: Response): Promise<void> => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        res.status(403).json({ success: false, error: { code: ErrorCode.USER_NOT_IN_COMPANY, message: 'User must belong to a company' } });
        return;
      }
      const parsed = CreateHolidaySchema.safeParse(req.body);
      if (!parsed.success) { sendValidationError(res, parsed.error); return; }

      const holiday = await holidayService.createHoliday(
        req.user!.userId,
        companyId,
        parsed.data
      );
      res.status(201).json({ success: true, data: holiday });
    } catch (err: any) {
      if (err.code === ErrorCode.VALIDATION_ERROR) {
        res.status(400).json({ success: false, error: { code: ErrorCode.VALIDATION_ERROR, message: err.message } });
        return;
      }
      console.error('[HolidaysController.createHoliday]', err);
      const code = (err as any)?.code;
      if (code === '23505') {
        res.status(409).json({ success: false, error: { code: 'HOLIDAY_DUPLICATE', message: 'A holiday already exists for this date' } });
        return;
      }
      res.status(500).json({ success: false, error: { code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Internal server error' } });
    }
  };

  updateHoliday = async (req: Request, res: Response): Promise<void> => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        res.status(403).json({ success: false, error: { code: ErrorCode.USER_NOT_IN_COMPANY, message: 'User must belong to a company' } });
        return;
      }
      const parsed = UpdateHolidaySchema.safeParse(req.body);
      if (!parsed.success) { sendValidationError(res, parsed.error); return; }

      const holiday = await holidayService.updateHoliday(req.user!.userId, req.params.id, parsed.data, companyId);
      if (!holiday) {
        res.status(404).json({ success: false, error: { code: 'HOLIDAY_NOT_FOUND', message: 'Holiday not found' } });
        return;
      }
      res.json({ success: true, data: holiday });
    } catch (err: any) {
      if (err.code === ErrorCode.VALIDATION_ERROR) {
        res.status(400).json({ success: false, error: { code: ErrorCode.VALIDATION_ERROR, message: err.message } });
        return;
      }
      console.error('[HolidaysController.updateHoliday]', err);
      res.status(500).json({ success: false, error: { code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Internal server error' } });
    }
  };

  deleteHoliday = async (req: Request, res: Response): Promise<void> => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        res.status(403).json({ success: false, error: { code: ErrorCode.USER_NOT_IN_COMPANY, message: 'User must belong to a company' } });
        return;
      }
      const deleted = await holidayService.deleteHoliday(req.user!.userId, req.params.id, companyId);
      if (!deleted) {
        res.status(404).json({ success: false, error: { code: 'HOLIDAY_NOT_FOUND', message: 'Holiday not found' } });
        return;
      }
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      console.error('[HolidaysController.deleteHoliday]', err);
      res.status(500).json({ success: false, error: { code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Internal server error' } });
    }
  };

  // ─── Weekly Holiday Rules ─────────────────────────────────────────────────

  getWeeklyRules = async (req: Request, res: Response): Promise<void> => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        res.status(403).json({ success: false, error: { code: ErrorCode.USER_NOT_IN_COMPANY, message: 'User must belong to a company' } });
        return;
      }
      const rules = await holidayService.getWeeklyRules(companyId);
      res.json({ success: true, data: rules });
    } catch (err) {
      console.error('[HolidaysController.getWeeklyRules]', err);
      res.status(500).json({ success: false, error: { code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Internal server error' } });
    }
  };

  upsertWeeklyRule = async (req: Request, res: Response): Promise<void> => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        res.status(403).json({ success: false, error: { code: ErrorCode.USER_NOT_IN_COMPANY, message: 'User must belong to a company' } });
        return;
      }
      const parsed = UpsertWeeklyRuleSchema.safeParse(req.body);
      if (!parsed.success) { sendValidationError(res, parsed.error); return; }

      const rule = await holidayService.upsertWeeklyRule(
        req.user!.userId,
        companyId,
        parsed.data
      );
      res.json({ success: true, data: rule });
    } catch (err) {
      console.error('[HolidaysController.upsertWeeklyRule]', err);
      res.status(500).json({ success: false, error: { code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Internal server error' } });
    }
  };

  batchUpsertWeeklyRules = async (req: Request, res: Response): Promise<void> => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        res.status(403).json({ success: false, error: { code: ErrorCode.USER_NOT_IN_COMPANY, message: 'User must belong to a company' } });
        return;
      }
      const parsed = BatchWeeklyRulesSchema.safeParse(req.body);
      if (!parsed.success) { sendValidationError(res, parsed.error); return; }

      const rules = await holidayService.batchUpsertWeeklyRules(
        req.user!.userId,
        companyId,
        parsed.data.rules
      );
      res.json({ success: true, data: rules });
    } catch (err) {
      console.error('[HolidaysController.batchUpsertWeeklyRules]', err);
      res.status(500).json({ success: false, error: { code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Internal server error' } });
    }
  };

  // ─── Working Days Calculator (utility endpoint) ───────────────────────────

  countWorkingDays = async (req: Request, res: Response): Promise<void> => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        res.status(403).json({ success: false, error: { code: ErrorCode.USER_NOT_IN_COMPANY, message: 'User must belong to a company' } });
        return;
      }
      const { start_date, end_date, office_id } = req.query;
      if (!start_date || !end_date) {
        res.status(400).json({ success: false, error: { code: ErrorCode.VALIDATION_ERROR, message: 'start_date and end_date query params required (YYYY-MM-DD)' } });
        return;
      }
      const startDate = new Date(String(start_date) + 'T00:00:00Z');
      const endDate = new Date(String(end_date) + 'T00:00:00Z');
      const officeId = office_id ? String(office_id) : null;

      const days = await holidayService.countWorkingDays(
        companyId,
        officeId,
        startDate,
        endDate
      );
      res.json({ success: true, data: { working_days: days, start_date, end_date } });
    } catch (err) {
      console.error('[HolidaysController.countWorkingDays]', err);
      res.status(500).json({ success: false, error: { code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Internal server error' } });
    }
  };
}

export const holidaysController = new HolidaysController();
