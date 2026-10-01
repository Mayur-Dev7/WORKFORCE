import { Router } from 'express';
import { shiftsController } from '../controllers/shifts.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.middleware.js';
import { PermissionKey } from '@workforce/shared';

const router = Router();

router.use(requireAuth());

// Get current shift for the logged-in employee (used on employee dashboard)
router.get('/current', shiftsController.getCurrent);

// Admin / RBAC endpoints
router.get('/', requirePermission(PermissionKey.SHIFT_READ), shiftsController.getAll);
router.get('/:id', requirePermission(PermissionKey.SHIFT_READ), shiftsController.getById);
router.post('/', requirePermission(PermissionKey.SHIFT_MANAGE), shiftsController.create);
router.put('/:id', requirePermission(PermissionKey.SHIFT_MANAGE), shiftsController.update);
router.delete('/:id', requirePermission(PermissionKey.SHIFT_MANAGE), shiftsController.delete);

export default router;
