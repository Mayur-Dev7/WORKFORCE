import { Request, Response } from 'express';
import { leaveService, AppError } from '../services/leave.service.js';
import { leaveBalanceService } from '../services/leaveBalance.service.js';
import { ApplyLeaveSchema, ReviewLeaveSchema, LeaveQuerySchema } from '../validators/leave.validators.js';
import { ErrorCode, PermissionKey } from '@workforce/shared';
import { ZodError } from 'zod';
import { pool } from '../lib/db.js';

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

function sendAppError(res: Response, error: AppError) {
  res.status(error.statusCode).json({
    success: false,
    error: { code: error.code, message: error.message },
  });
}

export class LeaveController {
  // ─── Employee: Apply for leave ────────────────────────────────────────────

  applyLeave = async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = ApplyLeaveSchema.safeParse(req.body);
      if (!parsed.success) { sendValidationError(res, parsed.error); return; }

      const userId = req.user!.userId;

      // Fetch user's company and office context
      const userRow = await pool.query<{ company_id: string; office_id: string }>(
        `SELECT company_id, office_id FROM users WHERE id = $1`,
        [userId]
      );
      if (!userRow.rows[0]) {
        res.status(404).json({ success: false, error: { code: ErrorCode.USER_NOT_FOUND, message: 'User not found' } });
        return;
      }

      const request = await leaveService.applyLeave(
        userId,
        { company_id: userRow.rows[0].company_id, office_id: userRow.rows[0].office_id },
        parsed.data
      );

      res.status(201).json({ success: true, data: request });
    } catch (err) {
      if (err instanceof AppError) { sendAppError(res, err); return; }
      console.error('[LeaveController.applyLeave]', err);
      res.status(500).json({ success: false, error: { code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Internal server error' } });
    }
  };

  // ─── Employee: Get my leave requests ─────────────────────────────────────

  getMyRequests = async (req: Request, res: Response): Promise<void> => {
    try {
      const q = LeaveQuerySchema.safeParse(req.query);
      if (!q.success) { sendValidationError(res, q.error); return; }

      const { rows, total } = await leaveService.getMyRequests(req.user!.userId, q.data);
      res.json({ success: true, data: rows, meta: { total, limit: q.data.limit, offset: q.data.offset } });
    } catch (err) {
      console.error('[LeaveController.getMyRequests]', err);
      res.status(500).json({ success: false, error: { code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Internal server error' } });
    }
  };

  // ─── Employee: Get my leave balances ─────────────────────────────────────

  getMyBalances = async (req: Request, res: Response): Promise<void> => {
    try {
      const year = req.query.year ? Number(req.query.year) : undefined;
      const balances = await leaveBalanceService.getBalancesForUser(req.user!.userId, year);
      res.json({ success: true, data: balances });
    } catch (err) {
      console.error('[LeaveController.getMyBalances]', err);
      res.status(500).json({ success: false, error: { code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Internal server error' } });
    }
  };

  // ─── Employee: Cancel own leave ───────────────────────────────────────────

  cancelMyLeave = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const perms = req.user!.permissions ?? [];
      const isAdmin = perms.includes(PermissionKey.LEAVE_APPROVE);

      const userRow = await pool.query<{ company_id: string }>(
        `SELECT company_id FROM users WHERE id = $1`, [userId]
      );

      const result = await leaveService.cancelLeave(
        userId, id, userRow.rows[0]?.company_id ?? '', isAdmin
      );
      res.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof AppError) { sendAppError(res, err); return; }
      console.error('[LeaveController.cancelMyLeave]', err);
      res.status(500).json({ success: false, error: { code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Internal server error' } });
    }
  };

  // ─── Admin: Get all company leave requests ────────────────────────────────

  getCompanyRequests = async (req: Request, res: Response): Promise<void> => {
    try {
      const q = LeaveQuerySchema.safeParse(req.query);
      if (!q.success) { sendValidationError(res, q.error); return; }

      const companyId = req.user?.companyId;
      if (!companyId) {
        res.status(403).json({ success: false, error: { code: ErrorCode.USER_NOT_IN_COMPANY, message: 'User must belong to a company' } });
        return;
      }
      const { rows, total } = await leaveService.getCompanyRequests(companyId, {
        ...q.data,
        userId: q.data.user_id,
      });
      res.json({ success: true, data: rows, meta: { total, limit: q.data.limit, offset: q.data.offset } });
    } catch (err) {
      console.error('[LeaveController.getCompanyRequests]', err);
      res.status(500).json({ success: false, error: { code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Internal server error' } });
    }
  };

  // ─── Admin: Review (approve/reject) leave request ─────────────────────────

  reviewLeave = async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = ReviewLeaveSchema.safeParse(req.body);
      if (!parsed.success) { sendValidationError(res, parsed.error); return; }

      const { id } = req.params;
      const result = await leaveService.reviewLeave(
        req.user!.userId,
        id,
        parsed.data.action,
        parsed.data.reviewer_note ?? null
      );
      res.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof AppError) { sendAppError(res, err); return; }
      console.error('[LeaveController.reviewLeave]', err);
      res.status(500).json({ success: false, error: { code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Internal server error' } });
    }
  };

  // ─── Admin: Get leave request by ID ──────────────────────────────────────

  getRequestById = async (req: Request, res: Response): Promise<void> => {
    try {
      const companyId = req.user?.companyId;
      const request = await leaveService.getRequestById(req.params.id, companyId || undefined);
      if (!request) {
        res.status(404).json({ success: false, error: { code: ErrorCode.LEAVE_NOT_FOUND, message: 'Leave request not found' } });
        return;
      }
      res.json({ success: true, data: request });
    } catch (err) {
      console.error('[LeaveController.getRequestById]', err);
      res.status(500).json({ success: false, error: { code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Internal server error' } });
    }
  };
}

export const leaveController = new LeaveController();
