import { Request, Response, NextFunction } from 'express';
import { getFirebaseAuth } from './firebase.admin.js';
import { usersRepository, UserRow } from '../../repositories/users.repository.js';
import { authService } from '../../services/auth.service.js';
import { loginAttemptsRepository } from '../../repositories/loginAttempts.repository.js';
import { auditLogsRepository } from '../../repositories/auditLogs.repository.js';
import { invitationsRepository } from '../../repositories/invitations.repository.js';
import { officesRepository } from '../../repositories/offices.repository.js';
import { withTransaction } from '../../lib/db.js';
import { ErrorCode, LoginEventType, AuditAction, RoleName } from '@workforce/shared';
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

      // 0. Token verification
      let decodedToken;
      try {
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

      const rawEmail = decodedToken.email;
      const emailVerified = decodedToken.email_verified;
      const firebaseUid = decodedToken.uid;
      const signInProvider = (decodedToken as any).firebase?.sign_in_provider || '';

      if (!rawEmail || emailVerified !== true) {
        res.status(401).json({
          success: false,
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'A verified email address is required for authentication',
          },
        });
        return;
      }

      // Normalize email with trim + lowercase only (no dot/plus stripping)
      const firebaseEmail = rawEmail.trim().toLowerCase();

      // 1. Branch A — Existing Firebase-linked user (supports any configured Firebase provider)
      const linkedUser = await usersRepository.findByFirebaseUid(firebaseUid);
      if (linkedUser) {
        if (!linkedUser.is_active) {
          await loginAttemptsRepository.create({
            company_id: linkedUser.company_id || undefined,
            user_id: linkedUser.id,
            event_type: LoginEventType.DISABLED_ACCOUNT,
            failure_reason: 'Account is deactivated in PostgreSQL',
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

        if (linkedUser.email.trim().toLowerCase() !== firebaseEmail) {
          await loginAttemptsRepository.create({
            company_id: linkedUser.company_id || undefined,
            user_id: linkedUser.id,
            event_type: LoginEventType.UNKNOWN_EMPLOYEE,
            failure_reason: 'Email mismatch between verified Firebase token and user account',
            ip_address: req.ip,
            user_agent: req.headers['user-agent'],
          });
          res.status(403).json({
            success: false,
            error: {
              code: ErrorCode.ACCOUNT_IDENTITY_MISMATCH,
              message: 'Account identity mismatch: token email does not match registered employee email.',
            },
          });
          return;
        }

        await this.issueSuccessSession(linkedUser, req, res);
        return;
      }

      // For unlinked users, Google Sign-In is required to onboard or link
      if (signInProvider !== 'google.com') {
        await loginAttemptsRepository.create({
          event_type: LoginEventType.UNKNOWN_EMPLOYEE,
          failure_reason: 'Account not provisioned. Google Sign-In required.',
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
        });
        res.status(403).json({
          success: false,
          error: {
            code: ErrorCode.ACCOUNT_NOT_PROVISIONED,
            message: 'Account not provisioned. Google Sign-In is required for employee onboarding.',
          },
        });
        return;
      }

      // 2. Branch B — Pre-provisioned unlinked employee (first-login linking)
      const unlinkedMatches = await usersRepository.findUnlinkedByEmail(firebaseEmail);

      if (unlinkedMatches.length > 1) {
        await loginAttemptsRepository.create({
          event_type: LoginEventType.UNKNOWN_EMPLOYEE,
          failure_reason: 'Ambiguous configuration: multiple pre-provisioned users match email',
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
        });
        res.status(409).json({
          success: false,
          error: {
            code: ErrorCode.FORBIDDEN,
            message: 'Ambiguous account configuration. Multiple employee records match this email.',
          },
        });
        return;
      }

      if (unlinkedMatches.length === 1) {
        const candidate = unlinkedMatches[0];
        if (!candidate.is_active) {
          await loginAttemptsRepository.create({
            company_id: candidate.company_id || undefined,
            user_id: candidate.id,
            event_type: LoginEventType.DISABLED_ACCOUNT,
            failure_reason: 'Account is deactivated',
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

        // Privileged role approval requirement:
        // Do not auto-link privileged roles (COMPANY_ADMIN, HR_ADMIN, SUPER_ADMIN) unless approved
        const privilegedRoles = [RoleName.COMPANY_ADMIN, RoleName.HR_ADMIN, RoleName.SUPER_ADMIN];
        if (candidate.role_name && privilegedRoles.includes(candidate.role_name as RoleName)) {
          if (!candidate.approved_for_firebase_link) {
            await loginAttemptsRepository.create({
              company_id: candidate.company_id || undefined,
              user_id: candidate.id,
              event_type: LoginEventType.UNKNOWN_EMPLOYEE,
              failure_reason: 'Privileged unlinked account not approved for Firebase linking',
              ip_address: req.ip,
              user_agent: req.headers['user-agent'],
            });
            res.status(403).json({
              success: false,
              error: {
                code: ErrorCode.FORBIDDEN,
                message: 'Privileged account requires administrator approval before linking. Run approval script.',
              },
            });
            return;
          }
        }

        try {
          const updatedCount = await usersRepository.linkFirebaseUid(candidate.id, firebaseUid);
          if (updatedCount !== 1) {
            res.status(409).json({
              success: false,
              error: {
                code: ErrorCode.FORBIDDEN,
                message: 'Account was linked concurrently. Please retry login.',
              },
            });
            return;
          }
        } catch (dbErr: any) {
          if (dbErr.code === '23505') {
            res.status(409).json({
              success: false,
              error: {
                code: ErrorCode.FORBIDDEN,
                message: 'Firebase account is already linked to another employee.',
              },
            });
            return;
          }
          throw dbErr;
        }

        await auditLogsRepository.create({
          company_id: candidate.company_id || undefined,
          actor_user_id: candidate.id,
          action: AuditAction.FIRST_LOGIN_LINKED,
          entity_type: 'user',
          entity_id: candidate.id,
          metadata: {
            email: firebaseEmail,
            firebase_uid: firebaseUid,
            provider: signInProvider,
            role: candidate.role_name,
          },
        });

        const linkedEmployee = await usersRepository.findById(candidate.id);
        if (!linkedEmployee) {
          throw new Error('Failed to retrieve linked user');
        }

        await this.issueSuccessSession(linkedEmployee, req, res);
        return;
      }

      // Check collision: if a user with this email already exists in DB with another firebase UID
      const existingEmailUser = await usersRepository.findByEmail(firebaseEmail);
      if (existingEmailUser) {
        await loginAttemptsRepository.create({
          company_id: existingEmailUser.company_id || undefined,
          user_id: existingEmailUser.id,
          event_type: LoginEventType.UNKNOWN_EMPLOYEE,
          failure_reason: 'Account with email already exists with different credentials',
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
        });
        res.status(409).json({
          success: false,
          error: {
            code: ErrorCode.ACCOUNT_IDENTITY_MISMATCH,
            message: 'An account with this email address already exists.',
          },
        });
        return;
      }

      // 3. Branch C — Multi-Tenant Invitation acceptance or Self-Service Onboarding
      const pendingInvitations = await invitationsRepository.findPendingByEmail(firebaseEmail);

      // If user has exactly one pending invitation, automatically accept it on first login!
      if (pendingInvitations.length === 1) {
        const inv = pendingInvitations[0];
        const userName = decodedToken.name || firebaseEmail.split('@')[0];

        try {
          const user = await withTransaction(async (client) => {
            // Determine office: invitation office or primary active office
            let officeId = inv.office_id;
            if (!officeId) {
              const offices = await officesRepository.findAll(inv.company_id);
              const primary = offices.find((o) => o.is_active) || offices[0];
              if (!primary) {
                throw new Error('Target company has no active office');
              }
              officeId = primary.id;
            }

            const code = `EMP-${Date.now().toString().slice(-4)}`;

            const newUser = await usersRepository.create(
              {
                company_id: inv.company_id,
                office_id: officeId,
                department_id: inv.department_id || null,
                role_id: inv.role_id,
                employee_code: code,
                name: userName,
                email: firebaseEmail,
                firebase_uid: firebaseUid,
                auth_provider: 'firebase',
                firebase_linked_at: new Date(),
              },
              client
            );

            await invitationsRepository.markAccepted(inv.id, newUser.id, client);

            await auditLogsRepository.create(
              {
                company_id: inv.company_id,
                actor_user_id: newUser.id,
                action: AuditAction.INVITATION_ACCEPTED,
                entity_type: 'invitation',
                entity_id: inv.id,
                metadata: {
                  company_id: inv.company_id,
                  role_id: inv.role_id,
                  email: firebaseEmail,
                },
              },
              client
            );

            return newUser;
          });

          await this.issueSuccessSession(user, req, res);
          return;
        } catch (invErr: any) {
          if (invErr.code === '23505') {
            res.status(409).json({
              success: false,
              error: {
                code: ErrorCode.FORBIDDEN,
                message: 'Account was created concurrently. Please retry login.',
              },
            });
            return;
          }
          throw invErr;
        }
      }

      // If multiple invitations exist or zero invitations exist:
      // Create an onboarding user with company_id: null.
      // The user will be routed to /onboarding to either accept one of their invitations or create their company.
      const userName = decodedToken.name || firebaseEmail.split('@')[0];
      try {
        const onboardingUser = await usersRepository.createOnboardingUser({
          name: userName,
          email: firebaseEmail,
          firebase_uid: firebaseUid,
        });

        await auditLogsRepository.create({
          actor_user_id: onboardingUser.id,
          action: AuditAction.USER_CREATED,
          entity_type: 'user',
          entity_id: onboardingUser.id,
          metadata: {
            email: firebaseEmail,
            status: pendingInvitations.length > 1 ? 'onboarding_multiple_invitations' : 'onboarding_no_company',
            invitations_count: pendingInvitations.length,
          },
        });

        await this.issueSuccessSession(onboardingUser, req, res);
        return;
      } catch (createErr: any) {
        if (createErr.code === '23505') {
          res.status(409).json({
            success: false,
            error: {
              code: ErrorCode.FORBIDDEN,
              message: 'Account was created concurrently. Please retry login.',
            },
          });
          return;
        }
        throw createErr;
      }
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
            message: 'No account found with this employee code or corporate email',
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

  private async issueSuccessSession(userRow: UserRow, req: Request, res: Response): Promise<void> {
    await loginAttemptsRepository.create({
      company_id: userRow.company_id || undefined,
      user_id: userRow.id,
      event_type: LoginEventType.SUCCESS,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

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
  }
}

export const firebaseAuthController = new FirebaseAuthController();
