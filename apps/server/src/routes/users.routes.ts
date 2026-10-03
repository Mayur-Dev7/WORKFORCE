import { Router } from 'express';
import { usersController } from '../controllers/users.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.middleware.js';
import { PermissionKey } from '@workforce/shared';

const router = Router();

router.use(requireAuth());

// Self-service face enrollment & face template retrieval
router.post('/self/enroll-face', usersController.enrollSelfFace);
router.get('/self/face-template', usersController.getSelfFaceTemplate);

router.get('/', requirePermission(PermissionKey.USER_READ), usersController.getAll);
router.post('/', requirePermission(PermissionKey.USER_CREATE), usersController.create);
router.get('/:id', requirePermission(PermissionKey.USER_READ), usersController.getById);
router.patch('/:id', requirePermission(PermissionKey.USER_UPDATE), usersController.update);
router.put('/:id', requirePermission(PermissionKey.USER_UPDATE), usersController.update);
router.post('/:id/remove', requirePermission(PermissionKey.USER_DISABLE), usersController.removeEmployee);
router.post('/:id/enroll-face', requirePermission(PermissionKey.FACE_ENROLL), usersController.enrollFace);
router.post('/:id/face', requirePermission(PermissionKey.FACE_ENROLL), usersController.enrollFace);

export default router;
