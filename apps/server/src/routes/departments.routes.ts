import { Router } from 'express';
import { departmentsController } from '../controllers/departments.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.middleware.js';
import { PermissionKey } from '@workforce/shared';

const router = Router();

router.use(requireAuth());

router.get('/', requirePermission(PermissionKey.DEPARTMENT_READ), departmentsController.getAll);
router.post('/', requirePermission(PermissionKey.DEPARTMENT_CREATE), departmentsController.create);
router.patch('/:id', requirePermission(PermissionKey.DEPARTMENT_UPDATE), departmentsController.update);
router.put('/:id', requirePermission(PermissionKey.DEPARTMENT_UPDATE), departmentsController.update);

export default router;
