import { Request, Response, NextFunction } from 'express';
import { authService, TokenPayload } from '../services/auth.service.js';
import { usersRepository } from '../repositories/users.repository.js';
import { PermissionKey, ErrorCode, RoleName } from '@workforce/shared';

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
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      // Fast DB check: validates active status, current token_version, and latest company/role context
      const authContext = await usersRepository.getAuthTokenContext(payload.userId);
      if (!authContext || !authContext.is_active) {
        res.status(401).json({
          success: false,
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'User account is inactive or not found',
          },
        });
        return;
      }

      // If token version does not match, session was revoked (e.g. left company, removed by admin)
      if (payload.tokenVersion !== undefined && authContext.token_version !== payload.tokenVersion) {
        res.status(401).json({
          success: false,
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'Session has been revoked. Please sign in again.',
          },
        });
        return;
      }

      req.user = {
        userId: authContext.id,
        email: authContext.email,
        roleName: (authContext.role_name as RoleName) || null,
        companyId: authContext.company_id,
        permissions: (authContext.permissions || []) as PermissionKey[],
        tokenVersion: authContext.token_version,
      };

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

export function requireCompany() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !req.user.companyId) {
      res.status(403).json({
        success: false,
        error: {
          code: ErrorCode.USER_NOT_IN_COMPANY,
          message: 'User does not belong to any company. Please create or join a company first.',
        },
      });
      return;
    }
    next();
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
