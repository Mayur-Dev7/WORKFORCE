import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service.js';
import { livenessService } from '../services/liveness.service.js';
import { LoginSchema, RefreshSchema } from '../validators/index.js';
import { ErrorCode } from '@workforce/shared';

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = LoginSchema.parse(req.body);
      const result = await authService.login(validated.identifier, validated.password, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        latitude: validated.latitude,
        longitude: validated.longitude,
      });

      // Set secure HTTP-only refresh token cookie
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
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

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.cookies?.refreshToken || req.body?.refreshToken;
      if (!token) {
        res.status(401).json({
          success: false,
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'Refresh token is missing',
          },
        });
        return;
      }

      const result = await authService.refresh(token);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async logout(_req: Request, res: Response): Promise<void> {
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
    res.status(200).json({
      success: true,
      data: { message: 'Logged out successfully' },
    });
  }

  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: { code: ErrorCode.UNAUTHORIZED, message: 'Not authenticated' },
        });
        return;
      }
      const user = await authService.refresh(req.cookies?.refreshToken || '');
      res.status(200).json({
        success: true,
        data: user.user,
      });
    } catch {
      // Fallback to token payload
      res.status(200).json({
        success: true,
        data: req.user,
      });
    }
  }

  async getLivenessChallenge(_req: Request, res: Response): Promise<void> {
    const challenge = livenessService.generateChallenge();
    res.status(200).json({
      success: true,
      data: challenge,
    });
  }
}

export const authController = new AuthController();
