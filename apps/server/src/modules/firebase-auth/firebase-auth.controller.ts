import { Request, Response, NextFunction } from 'express';
import { getFirebaseAuth } from './firebase.admin.js';
import { usersRepository } from '../../repositories/users.repository.js';
import { authService } from '../../services/auth.service.js';
import { loginAttemptsRepository } from '../../repositories/loginAttempts.repository.js';
import { ErrorCode, LoginEventType } from '@workforce/shared';
import { z } from 'zod';

const FirebaseSessionSchema = z.object({
  idToken: z.string().min(1, 'Firebase ID token is required'),
});

const ResolveIdentifierSchema = z.object({
  identifier: z.string().min(1, 'Identifier is required'),
});

export class FirebaseAuthController {
  async session(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { idToken } = FirebaseSessionSchema.parse(req.body);
      const auth = getFirebaseAuth();

      let decodedToken;
      try {
        // Verify with checkRevoked = true
        decodedToken = await auth.verifyIdToken(idToken, true);
      } catch (verifyErr: any) {
        res.status(401).json({
          success: false,
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'Firebase token verification failed or token has been revoked',
          },
        });
        return;
      }

      // Look up user STRICTLY by firebase_uid. Never match by email at runtime.
      const userRow = await usersRepository.findByFirebaseUid(decodedToken.uid);

      if (!userRow) {
        await loginAttemptsRepository.create({
          event_type: LoginEventType.UNKNOWN_EMPLOYEE,
          failure_reason: 'Account not provisioned for Firebase UID',
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
        });

        res.status(403).json({
          success: false,
          error: {
            code: ErrorCode.ACCOUNT_NOT_PROVISIONED,
            message: 'Account not provisioned',
          },
        });
        return;
      }

      if (!userRow.is_active) {
        await loginAttemptsRepository.create({
          user_id: userRow.id,
          event_type: LoginEventType.DISABLED_ACCOUNT,
          failure_reason: 'Account is disabled',
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
        });

        res.status(403).json({
          success: false,
          error: {
            code: ErrorCode.ACCOUNT_DISABLED,
            message: 'Account has been deactivated. Contact HR or administrator.',
          },
        });
        return;
      }

      // Record successful login audit event
      await loginAttemptsRepository.create({
        user_id: userRow.id,
        event_type: LoginEventType.SUCCESS,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
      });

      // Issue internal application tokens using identical token generation
      const result = await authService.issueSession(userRow, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(200).json({
        success: true,
        data: {
          accessToken: result.accessToken,
          user: result.user,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async resolveIdentifier(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { identifier } = ResolveIdentifierSchema.parse(req.body);
      const trimmed = identifier.trim();

      if (trimmed.includes('@')) {
        res.status(200).json({
          success: true,
          data: {
            email: trimmed.toLowerCase(),
          },
        });
        return;
      }

      const userRow = await usersRepository.findByEmployeeCode(trimmed);
      if (!userRow) {
        res.status(404).json({
          success: false,
          error: {
            code: ErrorCode.USER_NOT_FOUND,
            message: 'No account found with this identifier',
          },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          email: userRow.email.toLowerCase(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const firebaseAuthController = new FirebaseAuthController();
