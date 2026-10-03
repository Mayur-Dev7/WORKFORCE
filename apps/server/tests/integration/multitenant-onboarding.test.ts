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

  it('9. Admin removes employee: pending leaves cancelled, session closed, face deleted, old token rejected, audit log written with company_id', async () => {
    // Create dedicated Company and 1 Admin + 1 Employee
    const compRes = await pool.query(`INSERT INTO companies (name) VALUES ('Removal Test Corp ' || NOW() || RANDOM()) RETURNING id`);
    const compId = compRes.rows[0].id;
    const offRes = await pool.query(`INSERT INTO offices (company_id, name, latitude, longitude) VALUES ($1, 'HQ', 12.9, 77.5) RETURNING id`, [compId]);
    const offId = offRes.rows[0].id;
    const adminRoleRes = await pool.query(`SELECT id FROM roles WHERE name = 'COMPANY_ADMIN'`);
    const empRoleRes = await pool.query(`SELECT id FROM roles WHERE name = 'EMPLOYEE'`);

    const adminEmail = `boss-${Date.now()}@removetest.com`;
    const adminUid = `boss-uid-${Date.now()}`;
    const bossRes = await pool.query(
      `INSERT INTO users (company_id, office_id, role_id, employee_code, name, email, is_active, token_version, approved_for_firebase_link, firebase_uid, auth_provider)
       VALUES ($1, $2, $3, 'BOSS-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 6), 'Boss', $4, true, 1, true, $5, 'firebase') RETURNING id`,
      [compId, offId, adminRoleRes.rows[0].id, adminEmail, adminUid]
    );
    const bossId = bossRes.rows[0].id;

    const workerEmail = `worker-${Date.now()}@removetest.com`;
    const workerUid = `worker-uid-${Date.now()}`;
    const workerRes = await pool.query(
      `INSERT INTO users (company_id, office_id, role_id, employee_code, name, email, is_active, token_version, approved_for_firebase_link, firebase_uid, auth_provider, face_enrolled)
       VALUES ($1, $2, $3, 'WRK-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 6), 'Worker', $4, true, 1, true, $5, 'firebase', true) RETURNING id`,
      [compId, offId, empRoleRes.rows[0].id, workerEmail, workerUid]
    );
    const workerId = workerRes.rows[0].id;

    // Add face template
    await pool.query(
      `INSERT INTO face_templates (user_id, embedding, model_name, model_version)
       VALUES ($1, $2, 'test-model', '1.0.0')`,
      [workerId, [0.1, 0.2, 0.3]]
    );

    // Add pending leave request
    const ltRes = await pool.query(`INSERT INTO leave_types (company_id, name, code, annual_quota) VALUES ($1, 'Paid Leave', 'PL-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 4), 10) RETURNING id`, [compId]);
    const ltId = ltRes.rows[0].id;
    const leaveReqRes = await pool.query(
      `INSERT INTO leave_requests (company_id, user_id, leave_type_id, start_date, end_date, days_requested, status)
       VALUES ($1, $2, $3, CURRENT_DATE + 5, CURRENT_DATE + 6, 2, 'PENDING') RETURNING id`,
      [compId, workerId, ltId]
    );
    const leaveReqId = leaveReqRes.rows[0].id;

    // Add open attendance session
    const openSessRes = await pool.query(
      `INSERT INTO attendance_sessions (company_id, user_id, office_id, check_in_at, check_in_latitude, check_in_longitude, check_in_distance_meters, check_in_face_similarity)
       VALUES ($1, $2, $3, NOW(), 12.9, 77.5, 10.0, 0.95) RETURNING id`,
      [compId, workerId, offId]
    );
    const openSessId = openSessRes.rows[0].id;

    // Login worker to obtain access token
    setMockFirebaseAuth({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: workerUid, email: workerEmail, email_verified: true, firebase: { sign_in_provider: 'google.com' }
      })
    } as any);
    const workerLogin = await request(app).post('/api/v1/auth/firebase/session').send({ idToken: 'token' });
    const workerToken = workerLogin.body.data.accessToken;

    // Login boss to obtain admin token
    setMockFirebaseAuth({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: adminUid, email: adminEmail, email_verified: true, firebase: { sign_in_provider: 'google.com' }
      })
    } as any);
    const bossLogin = await request(app).post('/api/v1/auth/firebase/session').send({ idToken: 'token' });
    const bossToken = bossLogin.body.data.accessToken;

    // Admin removes employee: DELETE /api/v1/users/:id
    const removeRes = await request(app)
      .delete(`/api/v1/users/${workerId}`)
      .set('Authorization', `Bearer ${bossToken}`);

    expect(removeRes.status).toBe(200);

    // 1. Pending leave cancelled
    const leaveCheck = await pool.query(`SELECT status FROM leave_requests WHERE id = $1`, [leaveReqId]);
    expect(leaveCheck.rows[0].status).toBe('CANCELLED');

    // 2. Attendance session auto-closed with reason 'removed'
    const sessCheck = await pool.query(`SELECT auto_closed, auto_close_reason, check_out_face_similarity FROM attendance_sessions WHERE id = $1`, [openSessId]);
    expect(sessCheck.rows[0].auto_closed).toBe(true);
    expect(sessCheck.rows[0].auto_close_reason).toBe('removed');
    expect(sessCheck.rows[0].check_out_face_similarity).toBeNull();

    // 3. Face template deleted and face_enrolled set to false
    const faceCheck = await pool.query(`SELECT * FROM face_templates WHERE user_id = $1`, [workerId]);
    expect(faceCheck.rows.length).toBe(0);
    const userFaceCheck = await pool.query(`SELECT face_enrolled, company_id FROM users WHERE id = $1`, [workerId]);
    expect(userFaceCheck.rows[0].face_enrolled).toBe(false);
    expect(userFaceCheck.rows[0].company_id).toBeNull();

    // 4. Audit log written with company_id
    const auditCheck = await pool.query(`SELECT company_id, action FROM audit_logs WHERE entity_id = $1 AND action = 'USER_REMOVED_FROM_COMPANY'`, [workerId]);
    expect(auditCheck.rows.length).toBe(1);
    expect(auditCheck.rows[0].company_id).toBe(compId);

    // 5. Removed worker's old token is rejected
    const workerAccessAttempt = await request(app)
      .get('/api/v1/attendance/history')
      .set('Authorization', `Bearer ${workerToken}`);
    expect(workerAccessAttempt.status).toBe(401);
  });

  it('10. Expired and revoked invitations: cannot accept expired or revoked invitation', async () => {
    const compRes = await pool.query(`INSERT INTO companies (name) VALUES ('Inv Test Corp ' || NOW() || RANDOM()) RETURNING id`);
    const compId = compRes.rows[0].id;
    const offRes = await pool.query(`INSERT INTO offices (company_id, name, latitude, longitude) VALUES ($1, 'HQ', 12.9, 77.5) RETURNING id`, [compId]);
    const empRoleRes = await pool.query(`SELECT id FROM roles WHERE name = 'EMPLOYEE'`);
    const adminRoleRes = await pool.query(`SELECT id FROM roles WHERE name = 'COMPANY_ADMIN'`);

    const adminEmail = `invadmin-${Date.now()}@invtest.com`;
    const adminRes = await pool.query(
      `INSERT INTO users (company_id, office_id, role_id, employee_code, name, email, is_active, token_version, approved_for_firebase_link, firebase_uid, auth_provider)
       VALUES ($1, $2, $3, 'INVA-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 6), 'Admin', $4, true, 1, true, 'uid-' || RANDOM(), 'firebase') RETURNING id`,
      [compId, offRes.rows[0].id, adminRoleRes.rows[0].id, adminEmail]
    );

    // Create an expired invitation
    const expEmail = `expired-${Date.now()}@invtest.com`;
    const expRes = await pool.query(
      `INSERT INTO invitations (company_id, email, role_id, office_id, invited_by, token_hash, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'hash1', 'pending', NOW() - INTERVAL '1 day') RETURNING id`,
      [compId, expEmail, empRoleRes.rows[0].id, offRes.rows[0].id, adminRes.rows[0].id]
    );
    const expInvId = expRes.rows[0].id;

    // Create a revoked invitation
    const revEmail = `revoked-${Date.now()}@invtest.com`;
    const revRes = await pool.query(
      `INSERT INTO invitations (company_id, email, role_id, office_id, invited_by, token_hash, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'hash2', 'revoked', NOW() + INTERVAL '5 days') RETURNING id`,
      [compId, revEmail, empRoleRes.rows[0].id, offRes.rows[0].id, adminRes.rows[0].id]
    );
    const revInvId = revRes.rows[0].id;

    // Attempting Google sign-in for expired invitation routes to onboarding user instead of auto-accepting
    setMockFirebaseAuth({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: `uid-exp-${Date.now()}`, email: expEmail, email_verified: true, firebase: { sign_in_provider: 'google.com' }
      })
    } as any);
    const expLogin = await request(app).post('/api/v1/auth/firebase/session').send({ idToken: 'token' });
    expect(expLogin.status).toBe(200);
    expect(expLogin.body.data.user.company_id).toBeNull(); // not joined to company

    const expToken = expLogin.body.data.accessToken;

    // Direct accept API rejects expired invitation
    const acceptExp = await request(app)
      .post(`/api/v1/invitations/${expInvId}/accept`)
      .set('Authorization', `Bearer ${expToken}`);
    expect(acceptExp.status).toBe(400);
    expect(acceptExp.body.error.code).toBe(ErrorCode.INVITATION_EXPIRED);

    // Direct accept API rejects revoked invitation
    setMockFirebaseAuth({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: `uid-rev-${Date.now()}`, email: revEmail, email_verified: true, firebase: { sign_in_provider: 'google.com' }
      })
    } as any);
    const revLogin = await request(app).post('/api/v1/auth/firebase/session').send({ idToken: 'token' });
    const revToken = revLogin.body.data.accessToken;

    const acceptRev = await request(app)
      .post(`/api/v1/invitations/${revInvId}/accept`)
      .set('Authorization', `Bearer ${revToken}`);
    expect(acceptRev.status).toBe(400);
    expect(acceptRev.body.error.code).toBe(ErrorCode.INVITATION_EXPIRED);
  });

  it('11. Two companies inviting the same email: both invitations coexist; accepting one joins that company and second requires leaving first', async () => {
    // Setup Company 1 and Company 2
    const c1Res = await pool.query(`INSERT INTO companies (name) VALUES ('Dual Inv Corp 1 ' || NOW() || RANDOM()) RETURNING id`);
    const c1Id = c1Res.rows[0].id;
    const o1Res = await pool.query(`INSERT INTO offices (company_id, name, latitude, longitude) VALUES ($1, 'HQ 1', 12.9, 77.5) RETURNING id`, [c1Id]);
    const o1Id = o1Res.rows[0].id;

    const c2Res = await pool.query(`INSERT INTO companies (name) VALUES ('Dual Inv Corp 2 ' || NOW() || RANDOM()) RETURNING id`);
    const c2Id = c2Res.rows[0].id;
    const o2Res = await pool.query(`INSERT INTO offices (company_id, name, latitude, longitude) VALUES ($1, 'HQ 2', 13.0, 77.6) RETURNING id`, [c2Id]);
    const o2Id = o2Res.rows[0].id;

    const empRoleRes = await pool.query(`SELECT id FROM roles WHERE name = 'EMPLOYEE'`);
    const adminRoleRes = await pool.query(`SELECT id FROM roles WHERE name = 'COMPANY_ADMIN'`);

    // Create admins
    const a1Email = `a1-${Date.now()}-${Math.floor(Math.random() * 10000)}@dual.com`;
    const a2Email = `a2-${Date.now()}-${Math.floor(Math.random() * 10000)}@dual.com`;

    const a1Res = await pool.query(
      `INSERT INTO users (company_id, office_id, role_id, employee_code, name, email, is_active, token_version, approved_for_firebase_link, firebase_uid, auth_provider)
       VALUES ($1, $2, $3, 'A1-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 6), 'Admin 1', $4, true, 1, true, 'uid-a1-' || RANDOM(), 'firebase') RETURNING id`,
      [c1Id, o1Id, adminRoleRes.rows[0].id, a1Email]
    );
    const a2Res = await pool.query(
      `INSERT INTO users (company_id, office_id, role_id, employee_code, name, email, is_active, token_version, approved_for_firebase_link, firebase_uid, auth_provider)
       VALUES ($1, $2, $3, 'A2-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 6), 'Admin 2', $4, true, 1, true, 'uid-a2-' || RANDOM(), 'firebase') RETURNING id`,
      [c2Id, o2Id, adminRoleRes.rows[0].id, a2Email]
    );

    const commonEmail = `shared-candidate-${Date.now()}@candidate.com`;

    // Company 1 invites candidate
    const inv1Res = await pool.query(
      `INSERT INTO invitations (company_id, email, role_id, office_id, invited_by, token_hash, status)
       VALUES ($1, $2, $3, $4, $5, 'h1', 'pending') RETURNING id`,
      [c1Id, commonEmail, empRoleRes.rows[0].id, o1Id, a1Res.rows[0].id]
    );
    const inv1Id = inv1Res.rows[0].id;

    // Company 2 invites candidate (MUST SUCCEED — both invitations coexist)
    const inv2Res = await pool.query(
      `INSERT INTO invitations (company_id, email, role_id, office_id, invited_by, token_hash, status)
       VALUES ($1, $2, $3, $4, $5, 'h2', 'pending') RETURNING id`,
      [c2Id, commonEmail, empRoleRes.rows[0].id, o2Id, a2Res.rows[0].id]
    );
    const inv2Id = inv2Res.rows[0].id;

    expect(inv1Id).toBeDefined();
    expect(inv2Id).toBeDefined();

    // Candidate signs in with Google. Because multiple invitations exist, user is created in onboarding mode (company_id: null)
    const candidateUid = `candidate-uid-${Date.now()}`;
    setMockFirebaseAuth({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: candidateUid, email: commonEmail, email_verified: true, firebase: { sign_in_provider: 'google.com' }
      })
    } as any);

    const loginRes = await request(app).post('/api/v1/auth/firebase/session').send({ idToken: 'token' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.user.company_id).toBeNull();
    const candidateToken = loginRes.body.data.accessToken;

    // Candidate accepts Invitation 1 (joins Company 1)
    const accept1 = await request(app)
      .post(`/api/v1/invitations/${inv1Id}/accept`)
      .set('Authorization', `Bearer ${candidateToken}`);
    expect(accept1.status).toBe(200);
    expect(accept1.body.data.user.company_id).toBe(c1Id);
    const c1MemberToken = accept1.body.data.accessToken;

    // Candidate attempts to accept Invitation 2 while still in Company 1 -> REJECTED (must leave first)
    const accept2 = await request(app)
      .post(`/api/v1/invitations/${inv2Id}/accept`)
      .set('Authorization', `Bearer ${c1MemberToken}`);
    expect(accept2.status).toBe(400);
    expect(accept2.body.error.code).toBe(ErrorCode.USER_ALREADY_IN_COMPANY);
  });

  it('12. Concurrent sole-admin departure: advisory lock prevents concurrent departures leaving company with 0 admins', async () => {
    const compRes = await pool.query(`INSERT INTO companies (name) VALUES ('Race Guard Corp ' || NOW() || RANDOM()) RETURNING id`);
    const compId = compRes.rows[0].id;
    const offRes = await pool.query(`INSERT INTO offices (company_id, name, latitude, longitude) VALUES ($1, 'HQ', 12.9, 77.5) RETURNING id`, [compId]);
    const adminRoleRes = await pool.query(`SELECT id FROM roles WHERE name = 'COMPANY_ADMIN'`);

    const adminEmail = `solerace-${Date.now()}@raceguard.com`;
    const adminUid = `uid-race-${Date.now()}`;
    await pool.query(
      `INSERT INTO users (company_id, office_id, role_id, employee_code, name, email, is_active, token_version, approved_for_firebase_link, firebase_uid, auth_provider)
       VALUES ($1, $2, $3, 'RACE-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 6), 'Sole Admin', $4, true, 1, true, $5, 'firebase')`,
      [compId, offRes.rows[0].id, adminRoleRes.rows[0].id, adminEmail, adminUid]
    );

    setMockFirebaseAuth({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: adminUid, email: adminEmail, email_verified: true, firebase: { sign_in_provider: 'google.com' }
      })
    } as any);
    const loginRes = await request(app).post('/api/v1/auth/firebase/session').send({ idToken: 'token' });
    const soleToken = loginRes.body.data.accessToken;

    // Fire 3 simultaneous departure requests
    const departures = await Promise.all([
      request(app).post('/api/v1/companies/leave').set('Authorization', `Bearer ${soleToken}`),
      request(app).post('/api/v1/companies/leave').set('Authorization', `Bearer ${soleToken}`),
      request(app).post('/api/v1/companies/leave').set('Authorization', `Bearer ${soleToken}`),
    ]);

    // ALL must be blocked with 403 (SOLE_ADMIN_CANNOT_LEAVE)
    for (const res of departures) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.SOLE_ADMIN_CANNOT_LEAVE);
    }

    // Company STILL has 1 active admin!
    const remainingAdmins = await pool.query(
      `SELECT COUNT(*)::int as count FROM users WHERE company_id = $1 AND role_id = $2 AND is_active = true`,
      [compId, adminRoleRes.rows[0].id]
    );
    expect(remainingAdmins.rows[0].count).toBe(1);
  });

  it('13. Team attendance and reports isolation: team attendance and reports queries never leak another company records', async () => {
    // Create Company X and Company Y with attendance sessions
    const cxRes = await pool.query(`INSERT INTO companies (name) VALUES ('Reports Corp X ' || NOW() || RANDOM()) RETURNING id`);
    const cxId = cxRes.rows[0].id;
    const oxRes = await pool.query(`INSERT INTO offices (company_id, name, latitude, longitude) VALUES ($1, 'HQ X', 12.9, 77.5) RETURNING id`, [cxId]);
    const oxId = oxRes.rows[0].id;

    const cyRes = await pool.query(`INSERT INTO companies (name) VALUES ('Reports Corp Y ' || NOW() || RANDOM()) RETURNING id`);
    const cyId = cyRes.rows[0].id;
    const oyRes = await pool.query(`INSERT INTO offices (company_id, name, latitude, longitude) VALUES ($1, 'HQ Y', 13.0, 77.6) RETURNING id`, [cyId]);
    const oyId = oyRes.rows[0].id;

    const adminRoleRes = await pool.query(`SELECT id FROM roles WHERE name = 'COMPANY_ADMIN'`);
    const empRoleRes = await pool.query(`SELECT id FROM roles WHERE name = 'EMPLOYEE'`);

    // Admin in Company X
    const adminXEmail = `adminx-${Date.now()}@cx.com`;
    const adminXUid = `uid-x-${Date.now()}`;
    await pool.query(
      `INSERT INTO users (company_id, office_id, role_id, employee_code, name, email, is_active, token_version, approved_for_firebase_link, firebase_uid, auth_provider)
       VALUES ($1, $2, $3, 'XADM-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 6), 'Admin X', $4, true, 1, true, $5, 'firebase')`,
      [cxId, oxId, adminRoleRes.rows[0].id, adminXEmail, adminXUid]
    );

    // Employee in Company Y
    const empYEmail = `empy-${Date.now()}@cy.com`;
    const empYRes = await pool.query(
      `INSERT INTO users (company_id, office_id, role_id, employee_code, name, email, is_active, token_version, approved_for_firebase_link, firebase_uid, auth_provider)
       VALUES ($1, $2, $3, 'YEMP-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 6), 'Emp Y', $4, true, 1, true, 'uid-y-' || RANDOM(), 'firebase') RETURNING id`,
      [cyId, oyId, empRoleRes.rows[0].id, empYEmail]
    );
    const empYId = empYRes.rows[0].id;

    // Create session in Company Y
    await pool.query(
      `INSERT INTO attendance_sessions (company_id, user_id, office_id, check_in_at, check_in_latitude, check_in_longitude, check_in_distance_meters, check_in_face_similarity)
       VALUES ($1, $2, $3, NOW(), 13.0, 77.6, 15.0, 0.96)`,
      [cyId, empYId, oyId]
    );

    // Login Admin X
    setMockFirebaseAuth({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: adminXUid, email: adminXEmail, email_verified: true, firebase: { sign_in_provider: 'google.com' }
      })
    } as any);
    const loginX = await request(app).post('/api/v1/auth/firebase/session').send({ idToken: 'token' });
    const tokenX = loginX.body.data.accessToken;

    // Admin X requests /attendance/team
    const teamRes = await request(app)
      .get('/api/v1/attendance/team')
      .set('Authorization', `Bearer ${tokenX}`);
    expect(teamRes.status).toBe(200);
    const teamSessions = teamRes.body.data || [];
    for (const s of teamSessions) {
      expect(s.company_id || cxId).toBe(cxId);
      expect(s.user_id).not.toBe(empYId);
    }

    // Admin X requests /reports/attendance
    const reportRes = await request(app)
      .get('/api/v1/reports/attendance')
      .set('Authorization', `Bearer ${tokenX}`);
    expect(reportRes.status).toBe(200);
    const reportSessions = reportRes.body.data || [];
    for (const s of reportSessions) {
      expect(s.company_id || cxId).toBe(cxId);
      expect(s.user_id).not.toBe(empYId);
    }
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
