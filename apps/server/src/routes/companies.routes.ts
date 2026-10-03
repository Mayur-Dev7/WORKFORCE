import { Router } from 'express';
import { companiesController } from '../controllers/companies.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.use(requireAuth());

router.post('/', companiesController.createCompany);
router.post('/leave', companiesController.leaveCompany);
router.get('/settings', companiesController.getSettings);
router.put('/settings', companiesController.updateSettings);

export default router;
