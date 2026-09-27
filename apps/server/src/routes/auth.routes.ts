import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { loginRateLimiter } from '../middleware/rateLimiter.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/login', loginRateLimiter, authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', requireAuth(), authController.me);
router.get('/liveness-challenge', authController.getLivenessChallenge);

export default router;
