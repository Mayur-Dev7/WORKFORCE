import { Router } from 'express';
import { auditController } from '../controllers/audit.controller.js';
import { requireAuth, requirePermission } from '../middleware/auth.middleware.js';
import { PermissionKey } from '@workforce/shared';

const router = Router();

router.use(requireAuth());

router.get('/', requirePermission(PermissionKey.AUDIT_READ), auditController.getAuditLogs);
router.get('/logs', requirePermission(PermissionKey.AUDIT_READ), auditController.getAuditLogs);
router.get('/login-attempts', requirePermission(PermissionKey.AUDIT_READ), auditController.getLoginAttempts);

export default router;
