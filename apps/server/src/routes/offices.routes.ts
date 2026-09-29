import { Router } from 'express';
import { officesController } from '../controllers/offices.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.middleware.js';
import { PermissionKey } from '@workforce/shared';

const router = Router();

router.use(requireAuth());

router.get('/', requirePermission(PermissionKey.OFFICE_READ), officesController.getAll);
router.post('/', requirePermission(PermissionKey.OFFICE_CREATE), officesController.create);
router.get('/:id', officesController.getById);
router.patch('/:id', requirePermission(PermissionKey.OFFICE_UPDATE), officesController.update);
router.post('/:id/apply-to-all', requirePermission(PermissionKey.OFFICE_UPDATE), officesController.applyToAll);
router.delete('/:id', requirePermission(PermissionKey.OFFICE_DISABLE), officesController.delete);

export default router;
