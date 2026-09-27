import { Router } from 'express';
import { holidaysController } from '../controllers/holidays.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.middleware.js';
import { PermissionKey } from '@workforce/shared';

const router = Router();
router.use(requireAuth());

// ─── Holiday calendar (all authenticated users can view) ──────────────────────
router.get(
  '/',
  requirePermission(PermissionKey.HOLIDAY_READ),
  holidaysController.getHolidays
);
router.get(
  '/working-days',
  requirePermission(PermissionKey.HOLIDAY_READ),
  holidaysController.countWorkingDays
);

// ─── Admin: manage holidays ───────────────────────────────────────────────────
router.post(
  '/',
  requirePermission(PermissionKey.HOLIDAY_MANAGE),
  holidaysController.createHoliday
);
router.patch(
  '/:id',
  requirePermission(PermissionKey.HOLIDAY_MANAGE),
  holidaysController.updateHoliday
);
router.delete(
  '/:id',
  requirePermission(PermissionKey.HOLIDAY_MANAGE),
  holidaysController.deleteHoliday
);

// ─── Weekly holiday rules ─────────────────────────────────────────────────────
router.get(
  '/weekly-rules',
  requirePermission(PermissionKey.HOLIDAY_READ),
  holidaysController.getWeeklyRules
);
router.post(
  '/weekly-rules',
  requirePermission(PermissionKey.HOLIDAY_MANAGE),
  holidaysController.upsertWeeklyRule
);
router.post(
  '/weekly-rules/batch',
  requirePermission(PermissionKey.HOLIDAY_MANAGE),
  holidaysController.batchUpsertWeeklyRules
);

export default router;
