import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { generateSyntheticEmbedding } from '../../db/seeds/seed.js';
import { pool } from '../../src/lib/db.js';

describe('Attendance Concurrency Protection Tests', () => {
  const app = createApp();

  let alexToken = '';
  let validLat = 37.774929;
  let validLon = -122.419416;
  const alexValidEmbedding = generateSyntheticEmbedding(42);

  beforeAll(async () => {
    // Clean any prior open session for Alex Mercer
    const userRes = await pool.query<{ id: string; office_id: string }>(`SELECT id, office_id FROM users WHERE employee_code = 'EMP-101'`);
    const alexId = userRes.rows[0].id;
    const officeRes = await pool.query<{ latitude: number; longitude: number }>(`SELECT latitude, longitude FROM offices WHERE id = $1`, [userRes.rows[0].office_id]);
    if (officeRes.rows[0]) {
      validLat = officeRes.rows[0].latitude;
      validLon = officeRes.rows[0].longitude;
    }
    await pool.query(`DELETE FROM attendance_sessions WHERE user_id = $1`, [alexId]);
    await pool.query(`UPDATE users SET face_enrolled = true, auth_provider = 'legacy' WHERE id = $1`, [alexId]);
    await pool.query(`
      INSERT INTO face_templates (user_id, embedding, model_name, model_version)
      VALUES ($1, $2, '@vladmandic/human', '3.2.0')
      ON CONFLICT (user_id) DO UPDATE SET embedding = EXCLUDED.embedding
    `, [alexId, alexValidEmbedding]);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'EMP-101', password: 'Password123!' });
    alexToken = res.body.data.accessToken;
  });

  it('prevents simultaneous check-in requests from creating two open sessions', async () => {
    // Fire 5 simultaneous check-in requests
    const promises = Array.from({ length: 5 }, () =>
      request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${alexToken}`)
        .send({
          employeeCodeOrEmail: 'EMP-101',
          latitude: validLat,
          longitude: validLon,
          accuracy: 10,
          embedding: alexValidEmbedding,
          livenessScore: 0.9,
        })
    );

    const responses = await Promise.all(promises);

    const successful = responses.filter((r) => r.status === 200);
    const rejected = responses.filter((r) => r.status === 400);

    // Exactly ONE request must succeed!
    expect(successful.length).toBe(1);
    expect(rejected.length).toBe(4);

    // Verify at the database level that exactly one open session exists
    const userRes = await pool.query<{ id: string }>(`SELECT id FROM users WHERE employee_code = 'EMP-101'`);
    const countRes = await pool.query<{ count: string }>(
      `SELECT count(*) as count FROM attendance_sessions WHERE user_id = $1 AND check_out_at IS NULL`,
      [userRes.rows[0].id]
    );

    expect(parseInt(countRes.rows[0].count, 10)).toBe(1);
  });
});
