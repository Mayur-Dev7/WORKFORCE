import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { setMockFirebaseAuth } from '../../src/modules/firebase-auth/firebase.admin.js';
import { usersRepository } from '../../src/repositories/users.repository.js';
import { pool } from '../../src/lib/db.js';
import { ErrorCode } from '@workforce/shared';
import { FirebaseIdentityProvisioner } from '../../src/modules/firebase-auth/identity-provisioner.js';

describe('Firebase Auth Integration & Unit Tests', () => {
  let app: any;
  let testUserRow: any;
  const originalAuthProvider = process.env.AUTH_PROVIDER;

  beforeEach(async () => {
    process.env.AUTH_PROVIDER = 'dual';
    app = createApp();

    // Fetch existing seeded user EMP-101 for testing
    testUserRow = await usersRepository.findByEmployeeCode('EMP-101');
    expect(testUserRow).toBeDefined();

    // Link test user with a known firebase_uid
    await pool.query(
      `UPDATE users
       SET firebase_uid = 'firebase-test-uid-101',
           auth_provider = 'firebase',
           firebase_linked_at = NOW()
       WHERE id = $1`,
      [testUserRow.id]
    );
  });

  afterEach(async () => {
    // Restore test user
    if (testUserRow) {
      await pool.query(
        `UPDATE users
         SET firebase_uid = NULL,
             auth_provider = 'legacy',
             firebase_linked_at = NULL,
             is_active = true
         WHERE id = $1`,
        [testUserRow.id]
      );
    }
    setMockFirebaseAuth(null);
    process.env.AUTH_PROVIDER = originalAuthProvider;
  });

  describe('POST /api/v1/auth/firebase/session (Token Exchange)', () => {
    it('successfully exchanges valid Firebase ID token for application session', async () => {
      const mockAuth = {
        verifyIdToken: vi.fn().mockResolvedValue({
          uid: 'firebase-test-uid-101',
          email: testUserRow.email,
        }),
      } as any;
      setMockFirebaseAuth(mockAuth);

      const res = await request(app)
        .post('/api/v1/auth/firebase/session')
        .send({ idToken: 'valid-firebase-id-token' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.id).toBe(testUserRow.id);
      expect(res.body.data.user.email).toBe(testUserRow.email);

      // Verify refresh cookie set
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('refreshToken=');

      expect(mockAuth.verifyIdToken).toHaveBeenCalledWith('valid-firebase-id-token', true);
    });

    it('returns 403 ACCOUNT_NOT_PROVISIONED for unprovisioned / unknown Firebase UID', async () => {
      const mockAuth = {
        verifyIdToken: vi.fn().mockResolvedValue({
          uid: 'unknown-unlinked-uid-999',
          email: 'unknown@example.com',
        }),
      } as any;
      setMockFirebaseAuth(mockAuth);

      const res = await request(app)
        .post('/api/v1/auth/firebase/session')
        .send({ idToken: 'unknown-uid-token' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.ACCOUNT_NOT_PROVISIONED);
    });

    it('returns 403 ACCOUNT_DISABLED if the user account is deactivated in Postgres', async () => {
      await pool.query(`UPDATE users SET is_active = false WHERE id = $1`, [testUserRow.id]);

      const mockAuth = {
        verifyIdToken: vi.fn().mockResolvedValue({
          uid: 'firebase-test-uid-101',
          email: testUserRow.email,
        }),
      } as any;
      setMockFirebaseAuth(mockAuth);

      const res = await request(app)
        .post('/api/v1/auth/firebase/session')
        .send({ idToken: 'valid-token-disabled-user' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.ACCOUNT_DISABLED);
    });

    it('returns 401 UNAUTHORIZED if verifyIdToken fails or token is revoked', async () => {
      const mockAuth = {
        verifyIdToken: vi.fn().mockRejectedValue(new Error('Firebase ID token has expired or is revoked')),
      } as any;
      setMockFirebaseAuth(mockAuth);

      const res = await request(app)
        .post('/api/v1/auth/firebase/session')
        .send({ idToken: 'revoked-token' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
    });
  });

  describe('POST /api/v1/auth/firebase/resolve-identifier', () => {
    it('returns corporate email when given valid employee code', async () => {
      const res = await request(app)
        .post('/api/v1/auth/firebase/resolve-identifier')
        .send({ identifier: 'EMP-101' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(testUserRow.email.toLowerCase());
    });

    it('returns lowercased email directly when given an email address', async () => {
      const res = await request(app)
        .post('/api/v1/auth/firebase/resolve-identifier')
        .send({ identifier: 'USER.TEST@Workforce.COM' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('user.test@workforce.com');
    });

    it('returns 404 USER_NOT_FOUND when employee code does not exist', async () => {
      const res = await request(app)
        .post('/api/v1/auth/firebase/resolve-identifier')
        .send({ identifier: 'EMP-NONEXISTENT' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.USER_NOT_FOUND);
    });
  });

  describe('Legacy Login Endpoint Rejection', () => {
    it('rejects legacy password login if user has auth_provider = firebase (in dual mode)', async () => {
      // testUserRow has auth_provider = 'firebase'
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: testUserRow.employee_code,
          password: 'Password123!',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.AUTH_METHOD_MISMATCH);
    });

    it('returns 410 AUTH_METHOD_DEPRECATED when AUTH_PROVIDER=firebase for all legacy logins', async () => {
      process.env.AUTH_PROVIDER = 'firebase';
      const firebaseModeApp = createApp();

      const res = await request(firebaseModeApp)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'EMP-001',
          password: 'Password123!',
        });

      expect(res.status).toBe(410);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ErrorCode.AUTH_METHOD_DEPRECATED);
    });
  });

  describe('FirebaseIdentityProvisioner', () => {
    it('creates Firebase user, updates DB, and returns password reset link', async () => {
      const mockAuth = {
        createUser: vi.fn().mockResolvedValue({ uid: testUserRow.id }),
        generatePasswordResetLink: vi.fn().mockResolvedValue('https://workforce.duckdns.org/reset?code=xyz'),
      } as any;
      setMockFirebaseAuth(mockAuth);

      const provisioner = new FirebaseIdentityProvisioner();
      const result = await provisioner.onUserCreated({
        id: testUserRow.id,
        email: testUserRow.email,
        name: testUserRow.name,
        employee_code: testUserRow.employee_code,
      });

      expect(mockAuth.createUser).toHaveBeenCalled();
      expect(mockAuth.generatePasswordResetLink).toHaveBeenCalled();
      expect(result.firebaseUid).toBe(testUserRow.id);
      expect(result.passwordResetLink).toBe('https://workforce.duckdns.org/reset?code=xyz');

      const updated = await usersRepository.findById(testUserRow.id);
      expect(updated?.firebase_uid).toBe(testUserRow.id);
      expect(updated?.auth_provider).toBe('firebase');
    });

    it('rolls back and cleans up Firebase user if DB update fails', async () => {
      const mockAuth = {
        createUser: vi.fn().mockResolvedValue({ uid: 'non-existent-user-id' }),
        deleteUser: vi.fn().mockResolvedValue(undefined),
      } as any;
      setMockFirebaseAuth(mockAuth);

      const provisioner = new FirebaseIdentityProvisioner();

      // Using non-existent user ID causes repository update to fail
      await expect(
        provisioner.onUserCreated({
          id: '00000000-0000-0000-0000-000000000000',
          email: 'nonexistent@workforce.com',
          name: 'Ghost User',
          employee_code: 'GHOST-01',
        })
      ).rejects.toThrow();

      expect(mockAuth.deleteUser).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000000');
    });

    it('calls Firebase updateUser and revokeRefreshTokens on disable', async () => {
      const mockAuth = {
        updateUser: vi.fn().mockResolvedValue({}),
        revokeRefreshTokens: vi.fn().mockResolvedValue({}),
      } as any;
      setMockFirebaseAuth(mockAuth);

      const provisioner = new FirebaseIdentityProvisioner();
      await provisioner.onUserDisabled(testUserRow.id, 'firebase-test-uid-101');

      expect(mockAuth.updateUser).toHaveBeenCalledWith('firebase-test-uid-101', { disabled: true });
      expect(mockAuth.revokeRefreshTokens).toHaveBeenCalledWith('firebase-test-uid-101');
    });
  });
});
