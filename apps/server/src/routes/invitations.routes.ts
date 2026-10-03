import { Router } from 'express';
import { invitationsController } from '../controllers/invitations.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.use(requireAuth());

router.get('/mine', invitationsController.listMyInvitations);
router.get('/', invitationsController.listCompanyInvitations);
router.get('/company', invitationsController.listCompanyInvitations);
router.post('/', invitationsController.createInvitation);
router.post('/:id/accept', invitationsController.acceptInvitation);
router.post('/:id/decline', invitationsController.declineInvitation);
router.delete('/:id', invitationsController.revokeInvitation);

export default router;
