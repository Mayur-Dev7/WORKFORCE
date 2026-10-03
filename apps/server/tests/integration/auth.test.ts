import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { ErrorCode } from '@workforce/shared';

describe('Auth Integration Tests', () => {
  const app = createApp();

  beforeAll(async () => {
    const { pool } = await import('../../src/lib/db.js');
    await pool.query(
      `UPDATE users
       SET auth_provider = 'legacy', is_active = true, firebase_uid = NULL
       WHERE employee_code = 'EMP-001'`
    );
  });

  it('successfully logs in with valid employee credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        identifier: 'EMP-001',
        password: 'Password123!',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.email).toBe('superadmin@workforce.com');
  });

  it('fails login with invalid password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        identifier: 'EMP-001',
        password: 'WrongPassword999!',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.INVALID_CREDENTIALS);
  });

  it('fails login with non-existent employee identifier', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        identifier: 'NON_EXISTENT_EMP_999',
        password: 'Password123!',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.INVALID_CREDENTIALS);
  });

  it('can refresh token with valid cookie or payload', async () => {
    // First login
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        identifier: 'EMP-001',
        password: 'Password123!',
      });

    const cookie = loginRes.headers['set-cookie'];

    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.success).toBe(true);
    expect(refreshRes.body.data.accessToken).toBeDefined();
  });

  it('clears session on logout', async () => {
    const res = await request(app).post('/api/v1/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
