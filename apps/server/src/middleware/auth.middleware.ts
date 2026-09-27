import { Request, Response, NextFunction } from 'express';
import { authService, TokenPayload } from '../services/auth.service.js';
import { PermissionKey, ErrorCode } from '@workforce/shared';

// Extend Express Request to include user context
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      requestId?: string;
    }
  }
}

export function requireAuth() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Authentication token missing or invalid',
        },
      });
      return;
    }

    const token = authHeader.split(' ')[1];
    try {
      const payload = authService.verifyAccessToken(token);
      req.user = payload;
      next();
    } catch {
      res.status(401).json({
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Access token expired or malformed',
        },
      });
      return;
    }
  };
}

export function requirePermission(permission: PermissionKey) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Authentication required',
        },
      });
      return;
    }

    // Check if user's role permissions include the requested permission key
    const userPermissions = req.user.permissions || [];
    if (!userPermissions.includes(permission)) {
      res.status(403).json({
        success: false,
        error: {
          code: ErrorCode.PERMISSION_DENIED,
          message: `Forbidden: Missing required permission [${permission}]`,
        },
      });
      return;
    }

    next();
  };
}
