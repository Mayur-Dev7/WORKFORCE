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

// Firebase Auth routes (enabled when AUTH_PROVIDER is dual or firebase)
router.use('/firebase', (req, res, next) => {
  if (getAuthProviderMode() === 'legacy') {
    return next();
  }
  return firebaseAuthRoutes(req, res, next);
});

router.post('/resolve-identifier', (req, res, next) => {
  if (getAuthProviderMode() === 'legacy') {
    return next();
  }
  return resolveIdentifierRateLimiter(req, res, () =>
    firebaseAuthController.resolveIdentifier(req, res, next)
  );
});

export default router;


