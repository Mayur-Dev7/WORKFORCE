import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { ErrorCode } from '@workforce/shared';

describe('Work Shifts & Break Schedule API & RBAC Tests', () => {
  const app = createApp();

  let employeeToken = '';
  let hrAdminToken = '';
  let superAdminToken = '';

  beforeAll(async () => {
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

  it('allows authenticated employee to fetch their current office work shift and breaks', async () => {
    const res = await request(app)
      .get('/api/v1/shifts/current')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.total_hours).toBeDefined();
    expect(Array.isArray(res.body.data.breaks)).toBe(true);
  });

  it('rejects unauthenticated requests to /api/v1/shifts/current', async () => {
    const res = await request(app).get('/api/v1/shifts/current');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it('allows SUPER_ADMIN to list all work shifts', async () => {
    const res = await request(app)
      .get('/api/v1/shifts')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('prohibits standard EMPLOYEE from creating work shifts (requires shift:manage)', async () => {
    const res = await request(app)
      .post('/api/v1/shifts')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        name: 'Unauthorized Shift',
        start_time: '08:00',
        end_time: '16:00',
        total_hours: 8,
        breaks: [
          {
            name: 'Lunch Break',
            start_time: '12:00',
            end_time: '13:00',
            duration_minutes: 60,
          },
        ],
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.PERMISSION_DENIED);
  });

  it('allows SUPER_ADMIN to create, update and delete a shift with scheduled breaks', async () => {
    // 1. Create shift
    const createRes = await request(app)
      .post('/api/v1/shifts')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'Engineering Flex 8h Shift',
        start_time: '10:00',
        end_time: '18:30',
        total_hours: 8.5,
        is_default: false,
        breaks: [
          {
            name: 'Lunch Hour',
            start_time: '13:30',
            end_time: '14:30',
            duration_minutes: 60,
            is_paid: false,
          },
          {
            name: 'Evening Coffee',
            start_time: '16:30',
            end_time: '16:45',
            duration_minutes: 15,
            is_paid: true,
          },
        ],
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.name).toBe('Engineering Flex 8h Shift');
    expect(createRes.body.data.total_hours).toBe(8.5);
    expect(createRes.body.data.breaks.length).toBe(2);

    const shiftId = createRes.body.data.id;

    // 2. Update shift
    const updateRes = await request(app)
      .put(`/api/v1/shifts/${shiftId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'Engineering Flex 8h Shift (Updated)',
        total_hours: 8.0,
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.name).toBe('Engineering Flex 8h Shift (Updated)');
    expect(updateRes.body.data.total_hours).toBe(8.0);

    // 3. Delete shift
    const deleteRes = await request(app)
      .delete(`/api/v1/shifts/${shiftId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.data.deleted).toBe(true);
  });
});
