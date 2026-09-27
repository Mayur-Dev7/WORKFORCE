import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { ErrorCode } from '@workforce/shared';
import { generateSyntheticEmbedding } from '../../db/seeds/seed.js';

describe('Attendance Verification & Geofence Integration Tests', () => {
  const app = createApp();

  let alexToken = '';
  let validLat = 37.774929;
  let validLon = -122.419416;
  let outsideLat = 37.850000;
  let outsideLon = -122.419416;

  // Alex Mercer's enrolled embedding is generated with seed 42
  const alexValidEmbedding = generateSyntheticEmbedding(42);
  const mismatchedEmbedding = generateSyntheticEmbedding(999);

  beforeAll(async () => {
    // Clean prior sessions for Alex Mercer and load office coordinates
    const { pool } = await import('../../src/lib/db.js');
    const userRes = await pool.query<{ id: string; office_id: string }>(`SELECT id, office_id FROM users WHERE employee_code = 'EMP-101'`);
    if (userRes.rows[0]) {
      const alexId = userRes.rows[0].id;
      const officeRes = await pool.query<{ latitude: number; longitude: number }>(`SELECT latitude, longitude FROM offices WHERE id = $1`, [userRes.rows[0].office_id]);
      if (officeRes.rows[0]) {
        validLat = officeRes.rows[0].latitude;
        validLon = officeRes.rows[0].longitude;
        outsideLat = validLat + 0.1;
        outsideLon = validLon + 0.1;
      }
      await pool.query(`DELETE FROM attendance_sessions WHERE user_id = $1`, [alexId]);
      await pool.query(`UPDATE face_templates SET embedding = $1 WHERE user_id = $2`, [alexValidEmbedding, alexId]);
    }

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'EMP-101', password: 'Password123!' });
    alexToken = res.body.data.accessToken;
  });

  it('rejects check-in if GPS accuracy exceeds maximum threshold', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${alexToken}`)
      .send({
        employeeCodeOrEmail: 'EMP-101',
        latitude: validLat,
        longitude: validLon,
        accuracy: 250, // exceeds 100m threshold
        embedding: alexValidEmbedding,
        livenessScore: 0.9,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.LOCATION_ACCURACY_LOW);
  });

  it('rejects check-in if employee is outside the assigned office geofence', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${alexToken}`)
      .send({
        employeeCodeOrEmail: 'EMP-101',
        latitude: outsideLat,
        longitude: outsideLon,
        accuracy: 15,
        embedding: alexValidEmbedding,
        livenessScore: 0.9,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.OUTSIDE_GEOFENCE);
  });

  it('rejects check-in if biometric face does not match enrolled template', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${alexToken}`)
      .send({
        employeeCodeOrEmail: 'EMP-101',
        latitude: validLat,
        longitude: validLon,
        accuracy: 15,
        embedding: mismatchedEmbedding,
        livenessScore: 0.9,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.FACE_MISMATCH);
  });

  it('successfully performs check-in when all identity, face, liveness, and geofence conditions are met', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${alexToken}`)
      .send({
        employeeCodeOrEmail: 'EMP-101',
        latitude: validLat,
        longitude: validLon,
        accuracy: 15,
        embedding: alexValidEmbedding,
        livenessScore: 0.95,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.check_in_at).toBeDefined();
    expect(res.body.data.check_out_at).toBeNull();
  });

  it('rejects duplicate check-in when an attendance session is already open', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${alexToken}`)
      .send({
        employeeCodeOrEmail: 'EMP-101',
        latitude: validLat,
        longitude: validLon,
        accuracy: 15,
        embedding: alexValidEmbedding,
        livenessScore: 0.95,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.ALREADY_CHECKED_IN);
  });

  it('successfully performs check-out to close the active session', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/check-out')
      .set('Authorization', `Bearer ${alexToken}`)
      .send({
        employeeCodeOrEmail: 'EMP-101',
        latitude: validLat,
        longitude: validLon,
        accuracy: 15,
        embedding: alexValidEmbedding,
        livenessScore: 0.95,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.check_out_at).not.toBeNull();
  });

  it('rejects check-out when no open attendance session exists', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/check-out')
      .set('Authorization', `Bearer ${alexToken}`)
      .send({
        employeeCodeOrEmail: 'EMP-101',
        latitude: validLat,
        longitude: validLon,
        accuracy: 15,
        embedding: alexValidEmbedding,
        livenessScore: 0.95,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.NO_ACTIVE_CHECKIN);
  });
});
