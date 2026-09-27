import { Router } from 'express';
import { rolesController } from '../controllers/roles.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.middleware.js';
import { PermissionKey } from '@workforce/shared';

const router = Router();

router.use(requireAuth());

router.get('/', requirePermission(PermissionKey.ROLE_READ), rolesController.getRoles);
router.get('/permissions', requirePermission(PermissionKey.ROLE_READ), rolesController.getPermissions);
router.patch('/:id/permissions', requirePermission(PermissionKey.ROLE_UPDATE), rolesController.updateRolePermissions);

export default router;
