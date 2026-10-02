import { Request, Response, NextFunction } from 'express';
import { getFirebaseAuth } from './firebase.admin.js';
import { usersRepository, UserRow } from '../../repositories/users.repository.js';
import { authService } from '../../services/auth.service.js';
import { loginAttemptsRepository } from '../../repositories/loginAttempts.repository.js';
import { auditLogsRepository } from '../../repositories/auditLogs.repository.js';
import { systemSettingsRepository } from '../../repositories/systemSettings.repository.js';
import { getBootstrapConfig } from './bootstrap.config.js';
import { withTransaction } from '../../lib/db.js';
import { ErrorCode, LoginEventType, AuditAction } from '@workforce/shared';
import { z } from 'zod';

const FirebaseSessionSchema = z.object({
  idToken: z.string().min(1, 'Firebase ID token is required'),
});

const ResolveIdentifierSchema = z.object({
  identifier: z.string().min(1, 'Identifier is required'),
});

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class FirebaseAuthController {
  async session(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { idToken } = FirebaseSessionSchema.parse(req.body);
      const auth = getFirebaseAuth();

      // 0. Token verification
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

      // 1. Branch A — Existing Firebase-linked user
      const linkedUser = await usersRepository.findByFirebaseUid(firebaseUid);
      if (linkedUser) {
        if (!linkedUser.is_active) {
          await loginAttemptsRepository.create({
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

      /**
       * CONTROLLED EXCEPTION:
       * firebase_uid is the authoritative runtime identity key.
       * Matching by verified email is a strictly controlled exception permitted ONLY for:
       * (1) Branch C: First-Admin Bootstrap (when system_settings.bootstrap.completed = false), and
       * (2) Branch B: First-Login Linking of exactly one pre-provisioned employee row.
       * In no circumstances is an arbitrary user created or granted Super Admin status.
       */

      // 2. Branch C — First-admin bootstrap (evaluated BEFORE Branch B)
      const { adminEmail: bootstrapAdminEmail, companyId: bootstrapCompanyId } = getBootstrapConfig();

      if (bootstrapAdminEmail && firebaseEmail === bootstrapAdminEmail) {
        if (!bootstrapCompanyId || !UUID_REGEX.test(bootstrapCompanyId)) {
          console.error('❌ [BOOTSTRAP ERROR] BOOTSTRAP_ADMIN_EMAIL matched but BOOTSTRAP_COMPANY_ID is missing or invalid.');
          res.status(500).json({
            success: false,
            error: {
              code: ErrorCode.INTERNAL_SERVER_ERROR,
              message: 'First-admin bootstrap configuration error: BOOTSTRAP_COMPANY_ID is missing or invalid.',
            },
          });
          return;
        }

        // Only Google OAuth is permitted for bootstrap
        if (signInProvider === 'google.com') {
          // Cheap pre-check
          const preCheck = await systemSettingsRepository.getBootstrapSetting();
          if (!preCheck.completed) {
            let bootstrapUser: UserRow | null = null;
            let bootstrapError: string | null = null;

            try {
              bootstrapUser = await withTransaction(async (client) => {
                // a. SELECT pg_advisory_xact_lock(74829103);
                await client.query('SELECT pg_advisory_xact_lock(74829103)');

                // b. Re-read bootstrap.completed inside the transaction
                const settingRes = await client.query<{ value: { completed: boolean; completed_at: string | null } }>(
                  `SELECT value FROM system_settings WHERE key = 'bootstrap'`
                );
                const setting = settingRes.rows[0]?.value;
                if (setting && setting.completed) {
                  return null; // Fall through to Branch B / D
                }

                // c. Verify no user with role SUPER_ADMIN exists
                const existingAdminRes = await client.query(
                  `SELECT 1 FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'SUPER_ADMIN' LIMIT 1`
                );
                if ((existingAdminRes.rowCount ?? 0) > 0) {
                  console.warn('⚠️ First-admin bootstrap aborted: A SUPER_ADMIN user already exists in the system.');
                  return null; // Fall through to Branch B / D
                }

                // d. Validate BOOTSTRAP_COMPANY_ID exists in companies
                const companyRes = await client.query(
                  `SELECT id FROM companies WHERE id = $1`,
                  [bootstrapCompanyId]
                );
                if ((companyRes.rowCount ?? 0) === 0) {
                  throw new Error(`Configured bootstrap company "${bootstrapCompanyId}" does not exist`);
                }

                // e. Resolve an active office of that company (ORDER BY created_at ASC LIMIT 1)
                const officeRes = await client.query<{ id: string }>(
                  `SELECT id FROM offices WHERE company_id = $1 AND is_active = true ORDER BY created_at ASC LIMIT 1`,
                  [bootstrapCompanyId]
                );
                if ((officeRes.rowCount ?? 0) === 0) {
                  throw new Error(`Configured bootstrap company "${bootstrapCompanyId}" has no active office`);
                }
                const bootstrapOfficeId = officeRes.rows[0].id;

                // f. Resolve roles.name = 'SUPER_ADMIN'
                const roleRes = await client.query<{ id: string }>(
                  `SELECT id FROM roles WHERE name = 'SUPER_ADMIN' LIMIT 1`
                );
                if ((roleRes.rowCount ?? 0) === 0) {
                  throw new Error('Role "SUPER_ADMIN" not found in database');
                }
                const superAdminRoleId = roleRes.rows[0].id;

                // g. Check for an existing users row in that company with lower(trim(email)) = firebaseEmail
                const existingUserRes = await client.query<{ id: string; employee_code: string; firebase_uid: string | null }>(
                  `SELECT id, employee_code, firebase_uid FROM users WHERE company_id = $1 AND LOWER(TRIM(email)) = $2`,
                  [bootstrapCompanyId, firebaseEmail]
                );

                let targetUserId: string;

                if ((existingUserRes.rowCount ?? 0) > 0) {
                  const existingUser = existingUserRes.rows[0];
                  if (existingUser.firebase_uid !== null && existingUser.firebase_uid !== firebaseUid) {
                    throw new Error('Conflicting user with existing Firebase UID already exists in bootstrap company');
                  }
                  // PROMOTE existing user
                  await client.query(
                    `UPDATE users
                     SET role_id = $1,
                         firebase_uid = $2,
                         auth_provider = 'firebase',
                         firebase_linked_at = NOW(),
                         is_active = true,
                         updated_at = NOW()
                     WHERE id = $3`,
                    [superAdminRoleId, firebaseUid, existingUser.id]
                  );
                  targetUserId = existingUser.id;
                } else {
                  // Find collision-safe employee_code
                  let codeIndex = 1;
                  let chosenCode = '';
                  while (!chosenCode) {
                    const candidateCode = `BOOTSTRAP-${String(codeIndex).padStart(3, '0')}`;
                    const codeCheck = await client.query(
                      `SELECT 1 FROM users WHERE company_id = $1 AND employee_code = $2`,
                      [bootstrapCompanyId, candidateCode]
                    );
                    if ((codeCheck.rowCount ?? 0) === 0) {
                      chosenCode = candidateCode;
                    } else {
                      codeIndex++;
                    }
                  }

                  const adminName = decodedToken.name || firebaseEmail.split('@')[0];
                  const insertRes = await client.query<{ id: string }>(
                    `INSERT INTO users (
                       company_id, office_id, role_id, employee_code,
                       name, email, password_hash, is_active,
                       firebase_uid, auth_provider, firebase_linked_at
                     )
                     VALUES ($1, $2, $3, $4, $5, $6, NULL, true, $7, 'firebase', NOW())
                     RETURNING id`,
                    [
                      bootstrapCompanyId,
                      bootstrapOfficeId,
                      superAdminRoleId,
                      chosenCode,
                      adminName,
                      firebaseEmail,
                      firebaseUid,
                    ]
                  );
                  targetUserId = insertRes.rows[0].id;
                }

                // h. Set system_settings bootstrap = {completed:true, completed_at:NOW()}
                await client.query(
                  `UPDATE system_settings
                   SET value = jsonb_build_object('completed', true, 'completed_at', NOW()),
                       updated_at = NOW()
                   WHERE key = 'bootstrap'`
                );

                // i. Write audit BOOTSTRAP_ADMIN_CREATED
                await auditLogsRepository.create(
                  {
                    actor_user_id: targetUserId,
                    action: AuditAction.BOOTSTRAP_ADMIN_CREATED,
                    entity_type: 'user',
                    entity_id: targetUserId,
                    metadata: {
                      email: firebaseEmail,
                      company_id: bootstrapCompanyId,
                      office_id: bootstrapOfficeId,
                      role: 'SUPER_ADMIN',
                      provider: signInProvider,
                    },
                  },
                  client
                );

                // Fetch promoted/created user row
                return await usersRepository.findById(targetUserId, client);
              });
            } catch (err: any) {
              bootstrapError = err.message;
              console.error('❌ First-admin bootstrap transaction failed:', err);
            }

            if (bootstrapError) {
              res.status(500).json({
                success: false,
                error: {
                  code: ErrorCode.INTERNAL_SERVER_ERROR,
                  message: `Bootstrap failed: ${bootstrapError}`,
                },
              });
              return;
            }

            if (bootstrapUser) {
              await this.issueSuccessSession(bootstrapUser, req, res);
              return;
            }
          }
        }
      }

      // 3. Branch B — Pre-provisioned employee (first-login linking)
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
          actor_user_id: candidate.id,
          action: AuditAction.FIRST_LOGIN_LINKED,
          entity_type: 'user',
          entity_id: candidate.id,
          metadata: {
            email: firebaseEmail,
            firebase_uid: firebaseUid,
            provider: signInProvider,
          },
        });

        const linkedEmployee = await usersRepository.findById(candidate.id);
        if (!linkedEmployee) {
          throw new Error('Failed to retrieve linked user');
        }

        await this.issueSuccessSession(linkedEmployee, req, res);
        return;
      }

      // 4. Branch D — Unknown account
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
