import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { usersRepository } from '../repositories/users.repository.js';
import { loginAttemptsRepository } from '../repositories/loginAttempts.repository.js';
import { auditLogsRepository } from '../repositories/auditLogs.repository.js';
import { RoleName, PermissionKey, LoginEventType, ErrorCode, User } from '@workforce/shared';

export interface TokenPayload {
  userId: string;
  email: string;
  roleName: RoleName;
  companyId: string;
  permissions: PermissionKey[];
}

export interface LoginResult {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  private accessSecret: string;
  private refreshSecret: string;
  private accessExpiresIn: string;
  private refreshExpiresIn: string;

  constructor() {
    this.accessSecret = process.env.JWT_ACCESS_SECRET || 'dev_access_secret_workforce_key_2026';
    this.refreshSecret = process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_workforce_key_2026';
    this.accessExpiresIn = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
    this.refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
  }

  generateTokens(payload: TokenPayload): { accessToken: string; refreshToken: string } {
    const accessToken = jwt.sign(payload, this.accessSecret, {
      expiresIn: this.accessExpiresIn,
    } as jwt.SignOptions);

    const refreshToken = jwt.sign({ userId: payload.userId }, this.refreshSecret, {
      expiresIn: this.refreshExpiresIn,
    } as jwt.SignOptions);

    return { accessToken, refreshToken };
  }

  verifyAccessToken(token: string): TokenPayload {
    return jwt.verify(token, this.accessSecret) as TokenPayload;
  }

  verifyRefreshToken(token: string): { userId: string } {
    return jwt.verify(token, this.refreshSecret) as { userId: string };
  }

  async login(
    identifier: string, // email or employee code
    passwordPlain: string,
    meta?: {
      ipAddress?: string;
      userAgent?: string;
      latitude?: number;
      longitude?: number;
    }
  ): Promise<LoginResult> {
    const userRow = await usersRepository.findByCodeOrEmail(identifier);

    if (!userRow) {
      await loginAttemptsRepository.create({
        event_type: LoginEventType.UNKNOWN_EMPLOYEE,
        failure_reason: `Unknown employee identifier: ${identifier}`,
        ip_address: meta?.ipAddress,
        user_agent: meta?.userAgent,
        latitude: meta?.latitude,
        longitude: meta?.longitude,
      });

      const err = new Error('Invalid employee code/email or password');
      (err as any).code = ErrorCode.INVALID_CREDENTIALS;
      throw err;
    }

    if (!userRow.is_active) {
      await loginAttemptsRepository.create({
        user_id: userRow.id,
        event_type: LoginEventType.DISABLED_ACCOUNT,
        failure_reason: 'Account is disabled',
        ip_address: meta?.ipAddress,
        user_agent: meta?.userAgent,
      });

      const err = new Error('Account has been deactivated. Contact HR or administrator.');
      (err as any).code = ErrorCode.ACCOUNT_DISABLED;
      throw err;
    }

    const passwordMatches = await bcrypt.compare(passwordPlain, userRow.password_hash);
    if (!passwordMatches) {
      await loginAttemptsRepository.create({
        user_id: userRow.id,
        event_type: LoginEventType.FAILED_PASSWORD,
        failure_reason: 'Password mismatch',
        ip_address: meta?.ipAddress,
        user_agent: meta?.userAgent,
        latitude: meta?.latitude,
        longitude: meta?.longitude,
      });

      const err = new Error('Invalid employee code/email or password');
      (err as any).code = ErrorCode.INVALID_CREDENTIALS;
      throw err;
    }

    // Success
    await loginAttemptsRepository.create({
      user_id: userRow.id,
      event_type: LoginEventType.SUCCESS,
      ip_address: meta?.ipAddress,
      user_agent: meta?.userAgent,
      latitude: meta?.latitude,
      longitude: meta?.longitude,
    });

    await usersRepository.updateLastLogin(userRow.id);

    const tokenPayload: TokenPayload = {
      userId: userRow.id,
      email: userRow.email,
      roleName: userRow.role_name as RoleName,
      companyId: userRow.company_id,
      permissions: (userRow.permissions || []) as PermissionKey[],
    };

    const tokens = this.generateTokens(tokenPayload);

    const user: User = {
      id: userRow.id,
      company_id: userRow.company_id,
      office_id: userRow.office_id,
      department_id: userRow.department_id,
      role_id: userRow.role_id,
      employee_code: userRow.employee_code,
      name: userRow.name,
      email: userRow.email,
      is_active: userRow.is_active,
      face_enrolled: userRow.face_enrolled,
      created_at: userRow.created_at.toISOString(),
      updated_at: userRow.updated_at.toISOString(),
      last_login_at: userRow.last_login_at ? userRow.last_login_at.toISOString() : null,
      company_name: userRow.company_name,
      office_name: userRow.office_name,
      department_name: userRow.department_name,
      role_name: userRow.role_name as RoleName,
      permissions: (userRow.permissions || []) as PermissionKey[],
    };

    return {
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; user: User }> {
    try {
      const decoded = this.verifyRefreshToken(refreshToken);
      const userRow = await usersRepository.findById(decoded.userId);

      if (!userRow || !userRow.is_active) {
        const err = new Error('User inactive or invalid session');
        (err as any).code = ErrorCode.UNAUTHORIZED;
        throw err;
      }

      const tokenPayload: TokenPayload = {
        userId: userRow.id,
        email: userRow.email,
        roleName: userRow.role_name as RoleName,
        companyId: userRow.company_id,
        permissions: (userRow.permissions || []) as PermissionKey[],
      };

      const accessToken = jwt.sign(tokenPayload, this.accessSecret, {
        expiresIn: this.accessExpiresIn,
      } as jwt.SignOptions);

      const user: User = {
        id: userRow.id,
        company_id: userRow.company_id,
        office_id: userRow.office_id,
        department_id: userRow.department_id,
        role_id: userRow.role_id,
        employee_code: userRow.employee_code,
        name: userRow.name,
        email: userRow.email,
        is_active: userRow.is_active,
        face_enrolled: userRow.face_enrolled,
        created_at: userRow.created_at.toISOString(),
        updated_at: userRow.updated_at.toISOString(),
        last_login_at: userRow.last_login_at ? userRow.last_login_at.toISOString() : null,
        company_name: userRow.company_name,
        office_name: userRow.office_name,
        department_name: userRow.department_name,
        role_name: userRow.role_name as RoleName,
        permissions: (userRow.permissions || []) as PermissionKey[],
      };

      return { accessToken, user };
    } catch {
      const err = new Error('Invalid or expired refresh token');
      (err as any).code = ErrorCode.UNAUTHORIZED;
      throw err;
    }
  }

  async getMe(userId: string): Promise<User | null> {
    const userRow = await usersRepository.findById(userId);
    if (!userRow || !userRow.is_active) return null;
    return {
      id: userRow.id,
      company_id: userRow.company_id,
      office_id: userRow.office_id,
      department_id: userRow.department_id,
      role_id: userRow.role_id,
      employee_code: userRow.employee_code,
      name: userRow.name,
      email: userRow.email,
      is_active: userRow.is_active,
      face_enrolled: userRow.face_enrolled,
      created_at: userRow.created_at.toISOString(),
      updated_at: userRow.updated_at.toISOString(),
      last_login_at: userRow.last_login_at ? userRow.last_login_at.toISOString() : null,
      company_name: userRow.company_name,
      office_name: userRow.office_name,
      department_name: userRow.department_name,
      role_name: userRow.role_name as RoleName,
      permissions: (userRow.permissions || []) as PermissionKey[],
    };
  }
}

export const authService = new AuthService();
