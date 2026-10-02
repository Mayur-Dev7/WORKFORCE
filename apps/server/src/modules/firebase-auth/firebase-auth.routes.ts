import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ErrorCode } from '@workforce/shared';
import { firebaseAuthController } from './firebase-auth.controller.js';

const router = Router();

export const sessionRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // max 30 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: ErrorCode.RATE_LIMITED,
        message: 'Too many session exchange attempts. Please try again after 15 minutes.',
      },
    });
  },
});

export const resolveIdentifierRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // strict rate limit: 10 requests / min per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: ErrorCode.RATE_LIMITED,
        message: 'Too many identifier lookup attempts. Please try again later.',
      },
    });
  },
});

router.post('/session', sessionRateLimiter, (req, res, next) => firebaseAuthController.session(req, res, next));
router.post('/resolve-identifier', resolveIdentifierRateLimiter, (req, res, next) => firebaseAuthController.resolveIdentifier(req, res, next));

export default router;
