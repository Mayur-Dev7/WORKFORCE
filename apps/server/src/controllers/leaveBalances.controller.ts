import { Request, Response } from 'express';
import { leaveBalanceService } from '../services/leaveBalance.service.js';
import { AllocateBalanceSchema, CreateLeaveTypeSchema, UpdateLeaveTypeSchema } from '../validators/leave.validators.js';
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

export class LeaveBalancesController {
  // ─── Leave Types ──────────────────────────────────────────────────────────

  getLeaveTypes = async (req: Request, res: Response): Promise<void> => {
    try {
      const companyId = req.user!.companyId;
      const types = await leaveBalanceService.getLeaveTypes(companyId);
      res.json({ success: true, data: types });
    } catch (err) {
      console.error('[LeaveBalancesController.getLeaveTypes]', err);
      res.status(500).json({ success: false, error: { code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Internal server error' } });
    }
  };

  createLeaveType = async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = CreateLeaveTypeSchema.safeParse(req.body);
      if (!parsed.success) { sendValidationError(res, parsed.error); return; }

      const type = await leaveBalanceService.createLeaveType(
        req.user!.userId,
        req.user!.companyId,
        parsed.data
      );
      res.status(201).json({ success: true, data: type });
    } catch (err) {
      console.error('[LeaveBalancesController.createLeaveType]', err);
      res.status(500).json({ success: false, error: { code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Internal server error' } });
    }
  };

  updateLeaveType = async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = UpdateLeaveTypeSchema.safeParse(req.body);
      if (!parsed.success) { sendValidationError(res, parsed.error); return; }

      const type = await leaveBalanceService.updateLeaveType(req.params.id, parsed.data);
      if (!type) {
        res.status(404).json({ success: false, error: { code: ErrorCode.LEAVE_TYPE_NOT_FOUND, message: 'Leave type not found' } });
        return;
      }
      res.json({ success: true, data: type });
    } catch (err) {
      console.error('[LeaveBalancesController.updateLeaveType]', err);
      res.status(500).json({ success: false, error: { code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Internal server error' } });
    }
  };

  // ─── Balances ─────────────────────────────────────────────────────────────

  getCompanyBalances = async (req: Request, res: Response): Promise<void> => {
    try {
      const year = req.query.year ? Number(req.query.year) : undefined;
      const balances = await leaveBalanceService.getBalancesForCompany(req.user!.companyId, year);
      res.json({ success: true, data: balances });
    } catch (err) {
      console.error('[LeaveBalancesController.getCompanyBalances]', err);
      res.status(500).json({ success: false, error: { code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Internal server error' } });
    }
  };

  allocateBalance = async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = AllocateBalanceSchema.safeParse(req.body);
      if (!parsed.success) { sendValidationError(res, parsed.error); return; }

      const balance = await leaveBalanceService.allocateBalance(req.user!.userId, parsed.data);
      res.status(201).json({ success: true, data: balance });
    } catch (err) {
      console.error('[LeaveBalancesController.allocateBalance]', err);
      res.status(500).json({ success: false, error: { code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Internal server error' } });
    }
  };

  initializeYearlyBalances = async (req: Request, res: Response): Promise<void> => {
    try {
      const year = req.body?.year ?? new Date().getUTCFullYear();
      if (typeof year !== 'number' || year < 2000 || year > 2100) {
        res.status(400).json({ success: false, error: { code: ErrorCode.VALIDATION_ERROR, message: 'year must be a number between 2000 and 2100' } });
        return;
      }

      const result = await leaveBalanceService.initializeYearlyBalancesForCompany(
        req.user!.userId,
        req.user!.companyId,
        year
      );
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('[LeaveBalancesController.initializeYearlyBalances]', err);
      res.status(500).json({ success: false, error: { code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Internal server error' } });
    }
  };
}

export const leaveBalancesController = new LeaveBalancesController();
