import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { ErrorCode } from '@workforce/shared';

describe('RBAC Permission Enforcement Tests', () => {
  const app = createApp();

  let employeeToken = '';
  let hrAdminToken = '';
  let superAdminToken = '';

  beforeAll(async () => {
    const { pool } = await import('../../src/lib/db.js');
    await pool.query(
      `UPDATE users
       SET auth_provider = 'legacy', is_active = true, firebase_uid = NULL
       WHERE employee_code IN ('EMP-001', 'EMP-002', 'EMP-101')`
    );

    // 1. Employee Login (Alex Mercer)
    const empRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'EMP-101', password: 'Password123!' });
    employeeToken = empRes.body.data.accessToken;

    // 2. HR Admin Login (Elena Ramos)
    const hrRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'EMP-002', password: 'Password123!' });
    hrAdminToken = hrRes.body.data.accessToken;

    // 3. Super Admin Login (Sarah Connor)
    const superRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'EMP-001', password: 'Password123!' });
    superAdminToken = superRes.body.data.accessToken;
  });

  it('rejects unauthenticated requests to protected endpoints', async () => {
    const res = await request(app).get('/api/v1/users');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it('prohibits standard EMPLOYEE from creating users (requires user:create)', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        company_id: '00000000-0000-0000-0000-000000000000',
        office_id: '00000000-0000-0000-0000-000000000000',
        role_id: '00000000-0000-0000-0000-000000000000',
        employee_code: 'EMP-HACK',
        name: 'Hacker',
        email: 'hacker@workforce.com',
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.PERMISSION_DENIED);
  });

  it('prohibits standard EMPLOYEE from creating offices', async () => {
    const res = await request(app)
      .post('/api/v1/offices')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        company_id: '00000000-0000-0000-0000-000000000000',
        name: 'Unauthorized Office',
        latitude: 37.77,
        longitude: -122.41,
        radius_meters: 100,
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.PERMISSION_DENIED);
  });

  it('allows HR_ADMIN to view and list employees', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${hrAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('allows SUPER_ADMIN full access to roles and permissions', async () => {
    const res = await request(app)
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
