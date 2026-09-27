import { Router } from 'express';
import { attendanceController } from '../controllers/attendance.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.middleware.js';
import { PermissionKey } from '@workforce/shared';

const router = Router();

router.use(requireAuth());

router.post('/check-in', requirePermission(PermissionKey.ATTENDANCE_CHECKIN), attendanceController.checkIn);
router.post('/check-out', requirePermission(PermissionKey.ATTENDANCE_CHECKOUT), attendanceController.checkOut);
router.get('/active', requirePermission(PermissionKey.ATTENDANCE_READ), attendanceController.getActiveSession);
router.get('/history', requirePermission(PermissionKey.ATTENDANCE_READ), attendanceController.getHistory);
router.get('/team', requirePermission(PermissionKey.ATTENDANCE_READ_TEAM), attendanceController.getTeamAttendance);

export default router;
