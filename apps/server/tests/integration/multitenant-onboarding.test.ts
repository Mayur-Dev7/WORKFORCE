import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/lib/db.js';
import { setMockFirebaseAuth } from '../../src/modules/firebase-auth/firebase.admin.js';
import { usersRepository } from '../../src/repositories/users.repository.js';
import { ErrorCode, RoleName } from '@workforce/shared';

describe('Multi-Tenant Self-Service Onboarding, Isolation & Revocation Integration Tests', () => {
  let app: any;
  const originalAuthProvider = process.env.AUTH_PROVIDER;

  beforeEach(() => {
    process.env.AUTH_PROVIDER = 'dual';
    app = createApp();
  });

  afterEach(async () => {
    setMockFirebaseAuth(null);
    process.env.AUTH_PROVIDER = originalAuthProvider;
  });

  it('1. New user with Google Sign-In is created as onboarding user (companyId: null)', async () => {
    const newUid = `google-uid-${Date.now()}`;
    const newEmail = `founder-${Date.now()}@newstartup.com`;

    const mockAuth = {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: newUid,
        email: newEmail,
        email_verified: true,
        name: 'Startup Founder',
        firebase: { sign_in_provider: 'google.com' },
      }),
    } as any;
    setMockFirebaseAuth(mockAuth);

    const res = await request(app)
      .post('/api/v1/auth/firebase/session')
      .send({ idToken: 'valid-google-token' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(newEmail);
    expect(res.body.data.user.company_id).toBeNull();
    expect(res.body.data.accessToken).toBeDefined();

    // Verify in database
    const dbUser = await usersRepository.findByEmail(newEmail);
    expect(dbUser).toBeDefined();
    expect(dbUser?.company_id).toBeNull();
    expect(dbUser?.firebase_uid).toBe(newUid);
  });

  it('2. Onboarding user creates company -> becomes COMPANY_ADMIN with office and settings', async () => {
    const newUid = `google-uid-founder-${Date.now()}`;
    const newEmail = `founder2-${Date.now()}@acme.com`;

    setMockFirebaseAuth({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: newUid,
        email: newEmail,
        email_verified: true,
        name: 'Acme Founder',
        firebase: { sign_in_provider: 'google.com' },
      }),
    } as any);

    const loginRes = await request(app)
      .post('/api/v1/auth/firebase/session')
      .send({ idToken: 'valid-google-token' });

    const onboardingToken = loginRes.body.data.accessToken;

    const uniqueCompName = `Acme Global Innovations ${Date.now()}`;
    const createCompanyRes = await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${onboardingToken}`)
      .send({
        name: uniqueCompName,
        officeName: 'Acme Tower HQ',
        work_start_time: '09:00',
        work_end_time: '18:00',
        weekly_off_days: [0, 6],
        casual_leaves_per_year: 14,
        sick_leaves_per_year: 10,
      });

    expect(createCompanyRes.status).toBe(201);
    expect(createCompanyRes.body.success).toBe(true);
    expect(createCompanyRes.body.data.company.name).toBe(uniqueCompName);
    expect(createCompanyRes.body.data.user.role_name).toBe(RoleName.COMPANY_ADMIN);
    expect(createCompanyRes.body.data.user.company_id).toBe(createCompanyRes.body.data.company.id);

    const adminToken = createCompanyRes.body.data.accessToken;

    // Verify company settings were created and populated
    const settingsRes = await request(app)
      .get('/api/v1/company/settings')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(settingsRes.status).toBe(200);
    expect(settingsRes.body.data.work_start_time).toBe('09:00:00');
    expect(settingsRes.body.data.work_end_time).toBe('18:00:00');
    expect(settingsRes.body.data.casual_leaves_per_year).toBe(14);
    expect(settingsRes.body.data.sick_leaves_per_year).toBe(10);
  });

  it('3. Admin cannot invite SUPER_ADMIN and non-admin cannot invite COMPANY_ADMIN', async () => {
    // Use EMP-001 (Sarah Connor, COMPANY_ADMIN)
    const adminUser = await usersRepository.findByEmployeeCode('EMP-001');
    const roleSuperAdminRes = await pool.query(`SELECT id FROM roles WHERE name = 'SUPER_ADMIN'`);
    const superAdminRoleId = roleSuperAdminRes.rows[0].id;

    const roleCompanyAdminRes = await pool.query(`SELECT id FROM roles WHERE name = 'COMPANY_ADMIN'`);
    const companyAdminRoleId = roleCompanyAdminRes.rows[0].id;

    // Reset firebase_uid to allow fresh test login
    const sarahUid3 = `sarah-uid-test-3-${Date.now()}`;
    await pool.query(
      `UPDATE users SET firebase_uid = $1, auth_provider = 'firebase', approved_for_firebase_link = true WHERE id = $2`,
      [sarahUid3, adminUser?.id]
    );

    setMockFirebaseAuth({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: sarahUid3,
        email: adminUser?.email,
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      }),
    } as any);

    const loginRes = await request(app)
      .post('/api/v1/auth/firebase/session')
      .send({ idToken: 'token' });

    expect(loginRes.status).toBe(200);
    const adminToken = loginRes.body.data.accessToken;

    // Attempt to invite as SUPER_ADMIN
    const inviteSuperRes = await request(app)
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'attacker@evil.com',
        role_id: superAdminRoleId,
      });

    expect(inviteSuperRes.status).toBe(403);
    expect(inviteSuperRes.body.error.code).toBe(ErrorCode.CANNOT_ASSIGN_SUPER_ADMIN);

    // Now test as regular employee trying to invite COMPANY_ADMIN
    const employeeUser = await usersRepository.findByEmployeeCode('EMP-102');
    const johnUid3 = `john-uid-test-3-${Date.now()}`;
    await pool.query(
      `UPDATE users SET firebase_uid = $1, auth_provider = 'firebase', approved_for_firebase_link = true WHERE id = $2`,
      [johnUid3, employeeUser?.id]
    );

    setMockFirebaseAuth({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: johnUid3,
        email: employeeUser?.email,
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      }),
    } as any);

    const empLoginRes = await request(app)
      .post('/api/v1/auth/firebase/session')
      .send({ idToken: 'token' });

    expect(empLoginRes.status).toBe(200);
    const empToken = empLoginRes.body.data.accessToken;

    const inviteAdminRes = await request(app)
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${empToken}`)
      .send({
        email: 'buddy@friend.com',
        role_id: companyAdminRoleId,
      });

    expect(inviteAdminRes.status).toBe(403);
  });

  it('4. Admin invites employee -> employee Google sign-in auto-joins company with invited role', async () => {
    const adminUser = await usersRepository.findByEmployeeCode('EMP-001');
    const roleEmployeeRes = await pool.query(`SELECT id FROM roles WHERE name = 'EMPLOYEE'`);
    const employeeRoleId = roleEmployeeRes.rows[0].id;
    const sarahUid4 = `sarah-uid-test-4-${Date.now()}`;

    await pool.query(
      `UPDATE users SET firebase_uid = $1, auth_provider = 'firebase', approved_for_firebase_link = true WHERE id = $2`,
      [sarahUid4, adminUser?.id]
    );

    setMockFirebaseAuth({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: sarahUid4,
        email: adminUser?.email,
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      }),
    } as any);

    const loginRes = await request(app)
      .post('/api/v1/auth/firebase/session')
      .send({ idToken: 'token' });

    expect(loginRes.status).toBe(200);
    const adminToken = loginRes.body.data.accessToken;

    const invitedEmail = `hiree-${Date.now()}@targetcompany.com`;

    // Admin creates invitation
    const inviteRes = await request(app)
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: invitedEmail,
        role_id: employeeRoleId,
      });

    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.data.email).toBe(invitedEmail);

    // Invited user signs in with Google
    const hireeUid = `google-uid-hiree-${Date.now()}`;
    setMockFirebaseAuth({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: hireeUid,
        email: invitedEmail,
        email_verified: true,
        name: 'New Hiree',
        firebase: { sign_in_provider: 'google.com' },
      }),
    } as any);

    const hireeLoginRes = await request(app)
      .post('/api/v1/auth/firebase/session')
      .send({ idToken: 'hiree-token' });

    expect(hireeLoginRes.status).toBe(200);
    expect(hireeLoginRes.body.success).toBe(true);
    expect(hireeLoginRes.body.data.user.email).toBe(invitedEmail);
    expect(hireeLoginRes.body.data.user.company_id).toBe(adminUser?.company_id);
    expect(hireeLoginRes.body.data.user.role_name).toBe(RoleName.EMPLOYEE);

    // Verify invitation marked as accepted in DB
    const invCheck = await pool.query(
      `SELECT status, accepted_by_user_id FROM invitations WHERE id = $1`,
      [inviteRes.body.data.id]
    );
    expect(invCheck.rows[0].status).toBe('accepted');
    expect(invCheck.rows[0].accepted_by_user_id).toBe(hireeLoginRes.body.data.user.id);
  });

  it('5. Cross-tenant isolation: Token from Company A cannot access Company B data', async () => {
    // Create second company with an office
    const companyBRes = await pool.query(
      `INSERT INTO companies (name) VALUES ('Company B Isolated Corp ' || NOW() || RANDOM()) RETURNING id`
    );
    const companyBId = companyBRes.rows[0].id;

    const officeBRes = await pool.query(
      `INSERT INTO offices (company_id, name, latitude, longitude, radius_meters)
       VALUES ($1, 'Office B HQ', 12.9, 77.5, 300) RETURNING id`,
      [companyBId]
    );
    const officeBId = officeBRes.rows[0].id;

    // Call as Sarah Connor (EMP-001, Company A Admin)
    const adminUserA = await usersRepository.findByEmployeeCode('EMP-001');
    const sarahUid5 = `sarah-uid-test-5-${Date.now()}`;
    await pool.query(
      `UPDATE users SET firebase_uid = $1, auth_provider = 'firebase', approved_for_firebase_link = true WHERE id = $2`,
      [sarahUid5, adminUserA?.id]
    );

    setMockFirebaseAuth({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: sarahUid5,
        email: adminUserA?.email,
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      }),
    } as any);

    const loginRes = await request(app)
      .post('/api/v1/auth/firebase/session')
      .send({ idToken: 'token' });

    expect(loginRes.status).toBe(200);
    const tokenA = loginRes.body.data.accessToken;

    // Trying to get office from Company B via Company A's token
    const officeGetRes = await request(app)
      .get(`/api/v1/offices/${officeBId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect([404, 403]).toContain(officeGetRes.status);

    // Trying to view report for Company B
    const reportRes = await request(app)
      .get('/api/v1/reports/attendance')
      .set('Authorization', `Bearer ${tokenA}`);

    // Must return rows for Company A only, none for Company B
    expect(reportRes.status).toBe(200);
    const rows = reportRes.body.data;
    if (Array.isArray(rows) && rows.length > 0) {
      for (const row of rows) {
        const sessionDb = await pool.query(`SELECT company_id FROM attendance_sessions WHERE id = $1`, [row.id]);
        expect(sessionDb.rows[0]?.company_id).toBe(adminUserA?.company_id);
      }
    }
  });

  it('6. Instant session revocation & cleanup on leave/remove', async () => {
    // Setup a user in Company A with active session
    const adminUser = await usersRepository.findByEmployeeCode('EMP-001');
    const roleEmpRes = await pool.query(`SELECT id FROM roles WHERE name = 'EMPLOYEE'`);
    const employeeRes = await usersRepository.findByEmail('alex@workforce.com'); // Alex Mercer
    expect(employeeRes).not.toBeNull();

    // Ensure employee is attached to Company A and any old sessions are removed
    const alexUid6 = `alex-uid-test-6-${Date.now()}`;
    await pool.query(
      `UPDATE users SET company_id = $1, office_id = $2, role_id = $3, is_active = true,
           employee_code = 'EMP-101', firebase_uid = $4, auth_provider = 'firebase',
           approved_for_firebase_link = true, face_enrolled = true
       WHERE id = $5`,
      [adminUser?.company_id, adminUser?.office_id, roleEmpRes.rows[0].id, alexUid6, employeeRes?.id]
    );
    await pool.query(`DELETE FROM attendance_sessions WHERE user_id = $1`, [employeeRes?.id]);

    setMockFirebaseAuth({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: alexUid6,
        email: employeeRes?.email,
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      }),
    } as any);

    const loginRes = await request(app)
      .post('/api/v1/auth/firebase/session')
      .send({ idToken: 'token' });

    expect(loginRes.status).toBe(200);
    const kyleToken = loginRes.body.data.accessToken;

    // Create open attendance session for Kyle (with check_in_distance_meters)
    const openSessionRes = await pool.query(
      `INSERT INTO attendance_sessions (
         company_id, user_id, office_id, check_in_at, check_in_latitude, check_in_longitude, check_in_distance_meters, check_in_face_similarity
       )
       VALUES ($1, $2, $3, NOW(), 12.9, 77.5, 10.0, 0.95)
       RETURNING id`,
      [adminUser?.company_id, employeeRes?.id, adminUser?.office_id]
    );
    const openSessionId = openSessionRes.rows[0].id;

    // Kyle leaves company
    const leaveRes = await request(app)
      .post('/api/v1/companies/leave')
      .set('Authorization', `Bearer ${kyleToken}`);

    expect(leaveRes.status).toBe(200);
    expect(leaveRes.body.success).toBe(true);

    // Verify old access token is REJECTED IMMEDIATELY
    const attemptWithOldToken = await request(app)
      .get('/api/v1/attendance/history')
      .set('Authorization', `Bearer ${kyleToken}`);

    expect(attemptWithOldToken.status).toBe(401);
    expect(attemptWithOldToken.body.error.message).toMatch(/revoked/i);

    // Verify open attendance session was auto-closed safely
    const sessionCheck = await pool.query(
      `SELECT auto_closed, auto_close_reason, check_out_face_similarity FROM attendance_sessions WHERE id = $1`,
      [openSessionId]
    );
    expect(sessionCheck.rows[0].auto_closed).toBe(true);
    expect(sessionCheck.rows[0].auto_close_reason).toBe('left_company');
    expect(sessionCheck.rows[0].check_out_face_similarity).toBeNull();

    // Verify face enrollment cleared
    const userCheck = await pool.query(`SELECT face_enrolled, company_id FROM users WHERE id = $1`, [employeeRes?.id]);
    expect(userCheck.rows[0].face_enrolled).toBe(false);
    expect(userCheck.rows[0].company_id).toBeNull();
  });

  it('7. Sole-admin departure protection: Sole admin cannot leave company', async () => {
    // Create a standalone company with exactly ONE admin
    const loneCompanyRes = await pool.query(
      `INSERT INTO companies (name) VALUES ('Lone Star Corp ' || NOW() || RANDOM()) RETURNING id`
    );
    const loneCompanyId = loneCompanyRes.rows[0].id;

    const loneOfficeRes = await pool.query(
      `INSERT INTO offices (company_id, name, latitude, longitude) VALUES ($1, 'HQ', 12.0, 77.0) RETURNING id`,
      [loneCompanyId]
    );
    const loneOfficeId = loneOfficeRes.rows[0].id;

    const roleAdminRes = await pool.query(`SELECT id FROM roles WHERE name = 'COMPANY_ADMIN'`);
    const adminRoleId = roleAdminRes.rows[0].id;
    const soleEmail = `sole-${Date.now()}-${Math.floor(Math.random() * 10000)}@lonestar.com`;
    const soleUid7 = `sole-admin-uid-7-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const loneAdminRes = await pool.query(
      `INSERT INTO users (company_id, office_id, role_id, employee_code, name, email, is_active, token_version, approved_for_firebase_link, firebase_uid, auth_provider)
       VALUES ($1, $2, $3, 'LONE-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 8), 'Sole Admin', $4, true, 1, true, $5, 'firebase')
       RETURNING id, email`,
      [loneCompanyId, loneOfficeId, adminRoleId, soleEmail, soleUid7]
    );

    setMockFirebaseAuth({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: soleUid7,
        email: soleEmail,
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      }),
    } as any);

    const loginRes = await request(app)
      .post('/api/v1/auth/firebase/session')
      .send({ idToken: 'token' });

    expect(loginRes.status).toBe(200);
    const soleToken = loginRes.body.data.accessToken;

    const leaveRes = await request(app)
      .post('/api/v1/companies/leave')
      .set('Authorization', `Bearer ${soleToken}`);

    expect(leaveRes.status).toBe(403);
    expect(leaveRes.body.error.code).toBe(ErrorCode.SOLE_ADMIN_CANNOT_LEAVE);
  });

  it('8. Database trigger backward compatibility: INSERT without company_id succeeds', async () => {
    const employeeRes = await usersRepository.findByEmployeeCode('EMP-102'); // John Connor
    expect(employeeRes?.company_id).toBeDefined();

    // Clean up any existing open attendance session for John Connor
    await pool.query(`DELETE FROM attendance_sessions WHERE user_id = $1`, [employeeRes?.id]);

    // Insert attendance session WITHOUT company_id (simulating older backend image)
    const insertRes = await pool.query(
      `INSERT INTO attendance_sessions (
         user_id, office_id, check_in_at, check_in_latitude, check_in_longitude, check_in_distance_meters, check_in_face_similarity
       )
       VALUES ($1, $2, NOW(), 12.97, 77.59, 12.0, 0.98)
       RETURNING id, company_id`,
      [employeeRes?.id, employeeRes?.office_id]
    );

    expect(insertRes.rows[0].id).toBeDefined();
    // Trigger trg_stamp_attendance_company must have auto-populated company_id
    expect(insertRes.rows[0].company_id).toBe(employeeRes?.company_id);
  });

  afterAll(async () => {
    const adminUser = await usersRepository.findByEmployeeCode('EMP-001');
    const roleEmpRes = await pool.query(`SELECT id FROM roles WHERE name = 'EMPLOYEE'`);
    await pool.query(
      `UPDATE users
       SET employee_code = 'EMP-101', company_id = $1, office_id = $2, role_id = $3, is_active = true
       WHERE email = 'alex@workforce.com'`,
      [adminUser?.company_id, adminUser?.office_id, roleEmpRes.rows[0].id]
    );
  });
});
