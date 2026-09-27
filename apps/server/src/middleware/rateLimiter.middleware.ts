import rateLimit from 'express-rate-limit';
import { ErrorCode } from '@workforce/shared';

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // max 30 login attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: ErrorCode.RATE_LIMITED,
        message: 'Too many login attempts. Please try again after 15 minutes.',
      },
    });
  },
});

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: ErrorCode.RATE_LIMITED,
        message: 'Rate limit exceeded. Please slow down requests.',
      },
    });
  },
});
