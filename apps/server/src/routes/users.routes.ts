import { Router } from 'express';
import { usersController } from '../controllers/users.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.middleware.js';
import { PermissionKey } from '@workforce/shared';

const router = Router();

router.use(requireAuth());

router.get('/', requirePermission(PermissionKey.USER_READ), usersController.getAll);
router.post('/', requirePermission(PermissionKey.USER_CREATE), usersController.create);
router.get('/:id', requirePermission(PermissionKey.USER_READ), usersController.getById);
router.patch('/:id', requirePermission(PermissionKey.USER_UPDATE), usersController.update);
router.post('/:id/enroll-face', requirePermission(PermissionKey.FACE_ENROLL), usersController.enrollFace);

export default router;
