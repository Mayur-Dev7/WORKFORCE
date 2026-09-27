import { Router } from 'express';
import { reportsController } from '../controllers/reports.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.middleware.js';
import { PermissionKey } from '@workforce/shared';

const router = Router();

router.use(requireAuth());

router.get('/attendance', requirePermission(PermissionKey.REPORTS_READ), reportsController.getAttendanceReport);
router.get('/attendance/export', requirePermission(PermissionKey.REPORTS_EXPORT), reportsController.exportAttendanceReport);
router.get('/stats', requirePermission(PermissionKey.REPORTS_READ), reportsController.getAdminStats);

export default router;
