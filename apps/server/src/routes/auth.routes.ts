import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { loginRateLimiter } from '../middleware/rateLimiter.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import firebaseAuthRoutes, { resolveIdentifierRateLimiter } from '../modules/firebase-auth/firebase-auth.routes.js';
import { firebaseAuthController } from '../modules/firebase-auth/firebase-auth.controller.js';
import { getAuthProviderMode } from '../modules/firebase-auth/types.js';

const router = Router();

router.post('/login', loginRateLimiter, authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', requireAuth(), authController.me);
router.get('/liveness-challenge', authController.getLivenessChallenge);

// Firebase Auth routes (enabled in dual and firebase modes)
if (getAuthProviderMode() !== 'legacy') {
  router.use('/firebase', firebaseAuthRoutes);
  router.post('/resolve-identifier', resolveIdentifierRateLimiter, (req, res, next) =>
    firebaseAuthController.resolveIdentifier(req, res, next)
  );
}

export default router;

