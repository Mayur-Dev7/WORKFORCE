import { Router } from 'express';
import { leaveController } from '../controllers/leave.controller.js';
import { leaveBalancesController } from '../controllers/leaveBalances.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.middleware.js';
import { PermissionKey } from '@workforce/shared';

const router = Router();
router.use(requireAuth());

// ─── Leave Types (admin) ──────────────────────────────────────────────────────
router.get(
  '/types',
  requirePermission(PermissionKey.HOLIDAY_READ),
  leaveBalancesController.getLeaveTypes
);
router.post(
  '/types',
  requirePermission(PermissionKey.LEAVE_TYPE_MANAGE),
  leaveBalancesController.createLeaveType
);
router.patch(
  '/types/:id',
  requirePermission(PermissionKey.LEAVE_TYPE_MANAGE),
  leaveBalancesController.updateLeaveType
);

// ─── Leave Balances (admin) ───────────────────────────────────────────────────
router.get(
  '/balances',
  requirePermission(PermissionKey.LEAVE_READ_TEAM),
  leaveBalancesController.getCompanyBalances
);
router.post(
  '/balances/allocate',
  requirePermission(PermissionKey.LEAVE_TYPE_MANAGE),
  leaveBalancesController.allocateBalance
);
router.post(
  '/balances/initialize-year',
  requirePermission(PermissionKey.LEAVE_TYPE_MANAGE),
  leaveBalancesController.initializeYearlyBalances
);

// ─── Self-service (employee) ──────────────────────────────────────────────────
router.post(
  '/my/requests',
  requirePermission(PermissionKey.LEAVE_APPLY),
  leaveController.applyLeave
);
router.get(
  '/my/requests',
  requirePermission(PermissionKey.LEAVE_READ_OWN),
  leaveController.getMyRequests
);
router.get(
  '/my/balances',
  requirePermission(PermissionKey.LEAVE_READ_OWN),
  leaveController.getMyBalances
);
router.delete(
  '/my/requests/:id',
  requirePermission(PermissionKey.LEAVE_APPLY),
  leaveController.cancelMyLeave
);

// ─── Admin: manage all company requests ──────────────────────────────────────
router.get(
  '/requests',
  requirePermission(PermissionKey.LEAVE_READ_TEAM),
  leaveController.getCompanyRequests
);
router.get(
  '/requests/:id',
  requirePermission(PermissionKey.LEAVE_READ_TEAM),
  leaveController.getRequestById
);
router.post(
  '/requests/:id/review',
  requirePermission(PermissionKey.LEAVE_APPROVE),
  leaveController.reviewLeave
);
router.delete(
  '/requests/:id',
  requirePermission(PermissionKey.LEAVE_APPROVE),
  leaveController.cancelMyLeave
);

export default router;
