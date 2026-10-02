import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { setMockFirebaseAuth } from '../../src/modules/firebase-auth/firebase.admin.js';
import { usersRepository } from '../../src/repositories/users.repository.js';
import { systemSettingsRepository } from '../../src/repositories/systemSettings.repository.js';
import { pool } from '../../src/lib/db.js';
import { ErrorCode, RoleName, LoginEventType, AuditAction } from '@workforce/shared';

describe('Firebase Auth & First-Admin Bootstrap Integration Tests', () => {
  let app: any;
  let testCompanyId: string;
  let testOfficeId: string;
  let superAdminRoleId: string;
  let employeeRoleId: string;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    process.env.AUTH_PROVIDER = 'dual';
    app = createApp();

    // Fetch seeded company and active office
    const compRes = await pool.query<{ id: string }>('SELECT id FROM companies LIMIT 1');
    testCompanyId = compRes.rows[0].id;

    const offRes = await pool.query<{ id: string }>(
      'SELECT id FROM offices WHERE company_id = $1 AND is_active = true LIMIT 1',
      [testCompanyId]
    );
    testOfficeId = offRes.rows[0].id;

    const roleRes = await pool.query<{ id: string; name: string }>('SELECT id, name FROM roles');
    superAdminRoleId = roleRes.rows.find((r) => r.name === RoleName.SUPER_ADMIN)!.id;
    employeeRoleId = roleRes.rows.find((r) => r.name === RoleName.EMPLOYEE)!.id;
  });

  afterEach(async () => {
    setMockFirebaseAuth(null);
    process.env = { ...originalEnv };
  });

  describe('STEP 1: Database Migration & Triggers (010_system_settings)', () => {
    it('migration seeds completed=true when a SUPER_ADMIN already exists', async () => {
      const setting = await systemSettingsRepository.getBootstrapSetting();
      expect(setting).toBeDefined();
      expect(setting.completed).toBe(true);
      expect(setting.completed_at).toBeTruthy();
    });

    it('trigger blocks updating bootstrap.completed from true to false', async () => {
      await expect(
        pool.query(
          `UPDATE system_settings
           SET value = jsonb_build_object('completed', false, 'completed_at', NULL)
           WHERE key = 'bootstrap'`
        )
      ).rejects.toThrow(/Resetting bootstrap\.completed from true to false is strictly prohibited/);
    });

    it('trigger blocks clearing bootstrap.completed_at', async () => {
      await expect(
        pool.query(
          `UPDATE system_settings
           SET value = jsonb_build_object('completed', true, 'completed_at', NULL)
           WHERE key = 'bootstrap'`
        )
      ).rejects.toThrow(/Clearing bootstrap\.completed_at is strictly prohibited/);
    });

    it('trigger blocks deletion of the bootstrap system setting row', async () => {
      await expect(
        pool.query(`DELETE FROM system_settings WHERE key = 'bootstrap'`)
      ).rejects.toThrow(/Deletion of bootstrap system setting is strictly prohibited/);
    });
  });

  describe('STEP 3 — Branch A: Existing Firebase-linked User', () => {
    let linkedUserId: string;
    const linkedEmail = 'branch-a-linked@workforce.com';
    const linkedFirebaseUid = 'fb-linked-uid-1001';

    beforeEach(async () => {
      const created = await pool.query<{ id: string }>(
        `INSERT INTO users (
           company_id, office_id, role_id, employee_code,
           name, email, is_active, firebase_uid, auth_provider, firebase_linked_at
         )
         VALUES ($1, $2, $3, 'LINKED-001', 'Linked User', $4, true, $5, 'firebase', NOW())
         RETURNING id`,
        [testCompanyId, testOfficeId, employeeRoleId, linkedEmail, linkedFirebaseUid]
      );
      linkedUserId = created.rows[0].id;
    });

    afterEach(async () => {
      await pool.query('DELETE FROM users WHERE id = $1', [linkedUserId]);
    });

    it('active linked user logs in successfully with valid session and refresh cookie', async () => {
      setMockFirebaseAuth({
        verifyIdToken: vi.fn().mockResolvedValue({
          uid: linkedFirebaseUid,
          email: linkedEmail,
          email_verified: true,
          firebase: { sign_in_provider: 'google.com' },
        }),
      });

      const res = await request(app)
        .post('/api/v1/auth/firebase/session')
        .send({ idToken: 'valid-token' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.id).toBe(linkedUserId);
      expect(res.body.data.user.email).toBe(linkedEmail);

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('refreshToken=');
    });

    it('inactive linked user is rejected with 403 ACCOUNT_DISABLED', async () => {
      await pool.query('UPDATE users SET is_active = false WHERE id = $1', [linkedUserId]);

      setMockFirebaseAuth({
        verifyIdToken: vi.fn().mockResolvedValue({
          uid: linkedFirebaseUid,
          email: linkedEmail,
          email_verified: true,
        }),
      });

      const res = await request(app)
        .post('/api/v1/auth/firebase/session')
        .send({ idToken: 'valid-token' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.ACCOUNT_DISABLED);
    });

    it('rejects with 403 ACCOUNT_IDENTITY_MISMATCH if token email differs from registered email', async () => {
      setMockFirebaseAuth({
        verifyIdToken: vi.fn().mockResolvedValue({
          uid: linkedFirebaseUid,
          email: 'different-email@gmail.com',
          email_verified: true,
        }),
      });

      const res = await request(app)
        .post('/api/v1/auth/firebase/session')
        .send({ idToken: 'mismatch-token' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.ACCOUNT_IDENTITY_MISMATCH);
    });
  });

  describe('STEP 3 — Branch B: Pre-provisioned Employee (First-login linking)', () => {
    let unlinkedUserId: string;
    const unlinkedEmail = 'preprov.test@workforce.com';
    const newGoogleUid = 'google-unlinked-uid-2002';

    beforeEach(async () => {
      const created = await pool.query<{ id: string }>(
        `INSERT INTO users (
           company_id, office_id, role_id, employee_code,
           name, email, is_active, firebase_uid, auth_provider
         )
         VALUES ($1, $2, $3, 'PREPROV-001', 'Preprov User', $4, true, NULL, 'legacy')
         RETURNING id`,
        [testCompanyId, testOfficeId, employeeRoleId, unlinkedEmail]
      );
      unlinkedUserId = created.rows[0].id;
    });

    afterEach(async () => {
      await pool.query('DELETE FROM users WHERE id = $1', [unlinkedUserId]);
    });

    it('single pre-provisioned user links firebase_uid and receives session', async () => {
      setMockFirebaseAuth({
        verifyIdToken: vi.fn().mockResolvedValue({
          uid: newGoogleUid,
          email: unlinkedEmail.toUpperCase(), // test case-insensitivity
          email_verified: true,
          firebase: { sign_in_provider: 'google.com' },
        }),
      });

      const res = await request(app)
        .post('/api/v1/auth/firebase/session')
        .send({ idToken: 'first-login-token' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.id).toBe(unlinkedUserId);

      // Verify DB record was updated
      const updated = await usersRepository.findById(unlinkedUserId);
      expect(updated?.firebase_uid).toBe(newGoogleUid);
      expect(updated?.auth_provider).toBe('firebase');
      expect(updated?.firebase_linked_at).toBeDefined();

      // Verify audit log written
      const auditRes = await pool.query(
        `SELECT * FROM audit_logs WHERE entity_id = $1 AND action = $2`,
        [unlinkedUserId, AuditAction.FIRST_LOGIN_LINKED]
      );
      expect(auditRes.rowCount).toBe(1);
    });

    it('rejects ambiguous account configuration when multiple unlinked users have the same email', async () => {
      // Create a second company and a second user with the same email
      const comp2 = await pool.query<{ id: string }>(
        `INSERT INTO companies (name) VALUES ('Ambiguous Corp 99') RETURNING id`
      );
      const off2 = await pool.query<{ id: string }>(
        `INSERT INTO offices (company_id, name, latitude, longitude) VALUES ($1, 'Off 99', 37.0, -122.0) RETURNING id`,
        [comp2.rows[0].id]
      );
      const user2 = await pool.query<{ id: string }>(
        `INSERT INTO users (company_id, office_id, role_id, employee_code, name, email, is_active)
         VALUES ($1, $2, $3, 'PREPROV-002', 'Duplicate User', $4, true)
         RETURNING id`,
        [comp2.rows[0].id, off2.rows[0].id, employeeRoleId, unlinkedEmail]
      );

      try {
        setMockFirebaseAuth({
          verifyIdToken: vi.fn().mockResolvedValue({
            uid: 'ambiguous-uid-333',
            email: unlinkedEmail,
            email_verified: true,
          }),
        });

        const res = await request(app)
          .post('/api/v1/auth/firebase/session')
          .send({ idToken: 'ambiguous-token' });

        expect(res.status).toBe(409);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
      } finally {
        await pool.query('DELETE FROM users WHERE id = $1', [user2.rows[0].id]);
        await pool.query('DELETE FROM offices WHERE id = $1', [off2.rows[0].id]);
        await pool.query('DELETE FROM companies WHERE id = $1', [comp2.rows[0].id]);
      }
    });

    it('rejects pre-provisioned inactive user with 403 ACCOUNT_DISABLED', async () => {
      await pool.query('UPDATE users SET is_active = false WHERE id = $1', [unlinkedUserId]);

      setMockFirebaseAuth({
        verifyIdToken: vi.fn().mockResolvedValue({
          uid: 'inactive-google-uid',
          email: unlinkedEmail,
          email_verified: true,
        }),
      });

      const res = await request(app)
        .post('/api/v1/auth/firebase/session')
        .send({ idToken: 'inactive-token' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.ACCOUNT_DISABLED);
    });
  });

  describe('STEP 3 — Branch C: First-Admin Bootstrap Flow & Validations', () => {
    const bootstrapEmail = 'first.superadmin@example.com';
    const bootstrapUid = 'first-admin-google-uid';

    it('rejects unverified email with 401 UNAUTHORIZED', async () => {
      setMockFirebaseAuth({
        verifyIdToken: vi.fn().mockResolvedValue({
          uid: bootstrapUid,
          email: bootstrapEmail,
          email_verified: false,
          firebase: { sign_in_provider: 'google.com' },
        }),
      });

      const res = await request(app)
        .post('/api/v1/auth/firebase/session')
        .send({ idToken: 'unverified-email-token' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
    });

    it('non-matching Google email cannot bootstrap and is rejected with 403 ACCOUNT_NOT_PROVISIONED', async () => {
      process.env.BOOTSTRAP_ADMIN_EMAIL = bootstrapEmail;
      process.env.BOOTSTRAP_COMPANY_ID = testCompanyId;

      setMockFirebaseAuth({
        verifyIdToken: vi.fn().mockResolvedValue({
          uid: 'other-google-uid',
          email: 'someone.else@gmail.com',
          email_verified: true,
          firebase: { sign_in_provider: 'google.com' },
        }),
      });

      const res = await request(app)
        .post('/api/v1/auth/firebase/session')
        .send({ idToken: 'non-matching-token' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.ACCOUNT_NOT_PROVISIONED);
    });

    it('bootstrap fails clearly with 500 when BOOTSTRAP_COMPANY_ID is missing or invalid', async () => {
      process.env.BOOTSTRAP_ADMIN_EMAIL = bootstrapEmail;
      process.env.BOOTSTRAP_COMPANY_ID = 'invalid-uuid-1234';

      setMockFirebaseAuth({
        verifyIdToken: vi.fn().mockResolvedValue({
          uid: bootstrapUid,
          email: bootstrapEmail,
          email_verified: true,
          firebase: { sign_in_provider: 'google.com' },
        }),
      });

      const res = await request(app)
        .post('/api/v1/auth/firebase/session')
        .send({ idToken: 'bootstrap-token' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
      expect(res.body.error.message).toContain('BOOTSTRAP_COMPANY_ID is missing or invalid');
    });

    it('non-google.com sign_in_provider cannot trigger bootstrap', async () => {
      process.env.BOOTSTRAP_ADMIN_EMAIL = bootstrapEmail;
      process.env.BOOTSTRAP_COMPANY_ID = testCompanyId;

      setMockFirebaseAuth({
        verifyIdToken: vi.fn().mockResolvedValue({
          uid: bootstrapUid,
          email: bootstrapEmail,
          email_verified: true,
          firebase: { sign_in_provider: 'password' }, // password provider
        }),
      });

      const res = await request(app)
        .post('/api/v1/auth/firebase/session')
        .send({ idToken: 'password-provider-token' });

      // Non-google.com bypasses Branch C and falls through to Branch D
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.ACCOUNT_NOT_PROVISIONED);
    });

    it('bootstrap is rejected when a SUPER_ADMIN already exists in the system', async () => {
      process.env.BOOTSTRAP_ADMIN_EMAIL = bootstrapEmail;
      process.env.BOOTSTRAP_COMPANY_ID = testCompanyId;

      // In the seeded DB, Sarah Connor already exists as SUPER_ADMIN
      const adminExists = await pool.query(
        `SELECT 1 FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'SUPER_ADMIN'`
      );
      expect(adminExists.rowCount).toBeGreaterThan(0);

      setMockFirebaseAuth({
        verifyIdToken: vi.fn().mockResolvedValue({
          uid: bootstrapUid,
          email: bootstrapEmail,
          email_verified: true,
          firebase: { sign_in_provider: 'google.com' },
        }),
      });

      const res = await request(app)
        .post('/api/v1/auth/firebase/session')
        .send({ idToken: 'bootstrap-token' });

      // Falls through to Branch D
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.ACCOUNT_NOT_PROVISIONED);
    });
  });

  describe('STEP 3 — Branch C: End-to-End Successful Bootstrap Execution & Concurrency', () => {
    const freshBootstrapEmail = 'brand.new.admin@example.com';
    const freshBootstrapUid = 'brand-new-admin-uid-777';
    let previousSuperAdminIds: string[] = [];

    beforeEach(async () => {
      // Find all current superadmins and temporarily demote to employee to simulate fresh un-bootstrapped state
      const superAdmins = await pool.query<{ id: string }>(
        `SELECT id FROM users WHERE role_id = $1`,
        [superAdminRoleId]
      );
      previousSuperAdminIds = superAdmins.rows.map((r) => r.id);
      if (previousSuperAdminIds.length > 0) {
        await pool.query(
          `UPDATE users SET role_id = $1 WHERE id = ANY($2::uuid[])`,
          [employeeRoleId, previousSuperAdminIds]
        );
      }

      // Temporarily disable trigger to reset bootstrap state for testing fresh bootstrap
      await pool.query('ALTER TABLE system_settings DISABLE TRIGGER trg_protect_system_settings_bootstrap;');
      await pool.query(
        `UPDATE system_settings
         SET value = jsonb_build_object('completed', false, 'completed_at', NULL)
         WHERE key = 'bootstrap'`
      );
      await pool.query('ALTER TABLE system_settings ENABLE TRIGGER trg_protect_system_settings_bootstrap;');

      process.env.BOOTSTRAP_ADMIN_EMAIL = freshBootstrapEmail;
      process.env.BOOTSTRAP_COMPANY_ID = testCompanyId;
    });

    afterEach(async () => {
      // Clean up test created user
      await pool.query(`DELETE FROM users WHERE email = $1`, [freshBootstrapEmail]);

      // Re-enable trigger and restore bootstrap completed
      await pool.query('ALTER TABLE system_settings DISABLE TRIGGER trg_protect_system_settings_bootstrap;');
      await pool.query(
        `UPDATE system_settings
         SET value = jsonb_build_object('completed', true, 'completed_at', NOW())
         WHERE key = 'bootstrap'`
      );
      await pool.query('ALTER TABLE system_settings ENABLE TRIGGER trg_protect_system_settings_bootstrap;');

      // Restore original superadmins
      if (previousSuperAdminIds.length > 0) {
        await pool.query(
          `UPDATE users SET role_id = $1 WHERE id = ANY($2::uuid[])`,
          [superAdminRoleId, previousSuperAdminIds]
        );
      }
    });

    it('authorized verified Google email becomes SUPER_ADMIN in BOOTSTRAP_COMPANY_ID and sets bootstrap.completed=true', async () => {
      setMockFirebaseAuth({
        verifyIdToken: vi.fn().mockResolvedValue({
          uid: freshBootstrapUid,
          email: freshBootstrapEmail,
          email_verified: true,
          firebase: { sign_in_provider: 'google.com' },
        }),
      });

      const res = await request(app)
        .post('/api/v1/auth/firebase/session')
        .send({ idToken: 'fresh-bootstrap-token' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(freshBootstrapEmail);
      expect(res.body.data.user.role_name).toBe(RoleName.SUPER_ADMIN);
      expect(res.body.data.user.company_id).toBe(testCompanyId);

      // Verify DB record
      const createdUser = await usersRepository.findByEmail(freshBootstrapEmail);
      expect(createdUser).toBeDefined();
      expect(createdUser?.role_name).toBe(RoleName.SUPER_ADMIN);
      expect(createdUser?.firebase_uid).toBe(freshBootstrapUid);
      expect(createdUser?.employee_code).toMatch(/^BOOTSTRAP-\d{3}$/);

      // Verify system_settings
      const setting = await systemSettingsRepository.getBootstrapSetting();
      expect(setting.completed).toBe(true);
      expect(setting.completed_at).toBeDefined();

      // Verify audit log
      const audit = await pool.query(
        `SELECT * FROM audit_logs WHERE action = $1 AND entity_id = $2`,
        [AuditAction.BOOTSTRAP_ADMIN_CREATED, createdUser!.id]
      );
      expect(audit.rowCount).toBe(1);
    });

    it('promotes pre-existing unlinked row with bootstrap email to SUPER_ADMIN', async () => {
      const preUser = await pool.query<{ id: string }>(
        `INSERT INTO users (
           company_id, office_id, role_id, employee_code,
           name, email, is_active, firebase_uid, auth_provider
         )
         VALUES ($1, $2, $3, 'CUSTOM-CODE-99', 'Pre Existing Admin', $4, true, NULL, 'legacy')
         RETURNING id`,
        [testCompanyId, testOfficeId, employeeRoleId, freshBootstrapEmail]
      );

      setMockFirebaseAuth({
        verifyIdToken: vi.fn().mockResolvedValue({
          uid: freshBootstrapUid,
          email: freshBootstrapEmail,
          email_verified: true,
          firebase: { sign_in_provider: 'google.com' },
        }),
      });

      const res = await request(app)
        .post('/api/v1/auth/firebase/session')
        .send({ idToken: 'fresh-bootstrap-token' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.id).toBe(preUser.rows[0].id);
      expect(res.body.data.user.role_name).toBe(RoleName.SUPER_ADMIN);
      expect(res.body.data.user.employee_code).toBe('CUSTOM-CODE-99');

      const updated = await usersRepository.findById(preUser.rows[0].id);
      expect(updated?.role_name).toBe(RoleName.SUPER_ADMIN);
      expect(updated?.firebase_uid).toBe(freshBootstrapUid);
    });

    it('handles employee-code collision and picks next available code', async () => {
      const blocker = await pool.query<{ id: string }>(
        `INSERT INTO users (
           company_id, office_id, role_id, employee_code,
           name, email, is_active
         )
         VALUES ($1, $2, $3, 'BOOTSTRAP-001', 'Blocker', 'blocker@test.com', true)
         RETURNING id`,
        [testCompanyId, testOfficeId, employeeRoleId]
      );

      try {
        setMockFirebaseAuth({
          verifyIdToken: vi.fn().mockResolvedValue({
            uid: freshBootstrapUid,
            email: freshBootstrapEmail,
            email_verified: true,
            firebase: { sign_in_provider: 'google.com' },
          }),
        });

        const res = await request(app)
          .post('/api/v1/auth/firebase/session')
          .send({ idToken: 'fresh-bootstrap-token' });

        expect(res.status).toBe(200);
        expect(res.body.data.user.employee_code).toBe('BOOTSTRAP-002');
      } finally {
        await pool.query('DELETE FROM users WHERE id = $1', [blocker.rows[0].id]);
      }
    });

    it('two concurrent bootstrap requests result in exactly one SUPER_ADMIN', async () => {
      setMockFirebaseAuth({
        verifyIdToken: vi.fn().mockResolvedValue({
          uid: freshBootstrapUid,
          email: freshBootstrapEmail,
          email_verified: true,
          firebase: { sign_in_provider: 'google.com' },
        }),
      });

      const [res1, res2] = await Promise.all([
        request(app).post('/api/v1/auth/firebase/session').send({ idToken: 'req-1' }),
        request(app).post('/api/v1/auth/firebase/session').send({ idToken: 'req-2' }),
      ]);

      expect([200]).toContain(res1.status);
      expect([200]).toContain(res2.status);

      const usersRes = await pool.query(
        `SELECT id, role_id FROM users WHERE email = $1`,
        [freshBootstrapEmail]
      );
      expect(usersRes.rowCount).toBe(1);
      expect(usersRes.rows[0].role_id).toBe(superAdminRoleId);
    });
  });

  describe('STEP 3 — Branch D: Unknown Account Rejection', () => {
    it('unknown Google account returns 403 ACCOUNT_NOT_PROVISIONED without auto-creating user', async () => {
      const unknownEmail = 'unknown.stranger@gmail.com';

      setMockFirebaseAuth({
        verifyIdToken: vi.fn().mockResolvedValue({
          uid: 'unknown-uid-9999',
          email: unknownEmail,
          email_verified: true,
          firebase: { sign_in_provider: 'google.com' },
        }),
      });

      const res = await request(app)
        .post('/api/v1/auth/firebase/session')
        .send({ idToken: 'stranger-token' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.ACCOUNT_NOT_PROVISIONED);

      // Verify no user was created in Postgres
      const checkUser = await usersRepository.findByEmail(unknownEmail);
      expect(checkUser).toBeNull();
    });
  });
});
