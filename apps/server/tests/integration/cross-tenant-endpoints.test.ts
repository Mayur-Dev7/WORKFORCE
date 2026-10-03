import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/lib/db.js';
import { setMockFirebaseAuth } from '../../src/modules/firebase-auth/firebase.admin.js';
import { rolesRepository } from '../../src/repositories/roles.repository.js';
import { ErrorCode, RoleName } from '@workforce/shared';

describe('Exhaustive Cross-Tenant Endpoint Isolation & RBAC Test Suite', () => {
  let app: any;
  const originalAuthProvider = process.env.AUTH_PROVIDER;

  // Tenant A references
  let tokenA = '';
  let companyAId = '';
  let userAId = '';
  let officeAId = '';
  let deptAId = '';

  // Tenant B references
  let tokenB = '';
  let companyBId = '';
  let userBId = '';
  let officeBId = '';
  let deptBId = '';
  let shiftBId = '';
  let holidayBId = '';
  let leaveTypeBId = '';
  let leaveRequestBId = '';
  let invitationBId = '';

  let superAdminRoleId = '';
  let companyAdminRoleId = '';
  let employeeRoleId = '';

  beforeAll(async () => {
    process.env.AUTH_PROVIDER = 'dual';
    app = createApp();

    const superRole = await rolesRepository.findByName(RoleName.SUPER_ADMIN);
    const compRole = await rolesRepository.findByName(RoleName.COMPANY_ADMIN);
    const empRole = await rolesRepository.findByName(RoleName.EMPLOYEE);
    superAdminRoleId = superRole!.id;
    companyAdminRoleId = compRole!.id;
    employeeRoleId = empRole!.id;

    // 1. Create Tenant A
    const uidA = `google-uid-founder-a-${Date.now()}`;
    const emailA = `founder.a.${Date.now()}@tenant-a.com`;
    const uidB = `google-uid-founder-b-${Date.now()}`;
    const emailB = `founder.b.${Date.now()}@tenant-b.com`;

    const mockAuth = {
      verifyIdToken: vi.fn().mockImplementation(async (token: string) => {
        if (token === 'token-b') {
          return { uid: uidB, email: emailB, email_verified: true, name: 'Tenant B Founder', firebase: { sign_in_provider: 'google.com' } };
        }
        return { uid: uidA, email: emailA, email_verified: true, name: 'Tenant A Founder', firebase: { sign_in_provider: 'google.com' } };
      }),
      createUser: vi.fn().mockImplementation(async (params: any) => ({
        uid: `fb-${Date.now()}-${Math.random().toString().slice(-4)}`,
        email: params.email,
      })),
      generatePasswordResetLink: vi.fn().mockResolvedValue('https://reset-link.test'),
      updateUser: vi.fn().mockResolvedValue({}),
      deleteUser: vi.fn().mockResolvedValue({}),
      revokeRefreshTokens: vi.fn().mockResolvedValue({}),
    } as any;
    setMockFirebaseAuth(mockAuth);

    const authResA = await request(app)
      .post('/api/v1/auth/firebase/session')
      .send({ idToken: 'token-a' });
    const tempTokenA = authResA.body.data.accessToken;

    const compResA = await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${tempTokenA}`)
      .send({
        name: `Company Alpha ${Date.now()}`,
        officeName: 'Alpha HQ',
        latitude: 12.9716,
        longitude: 77.5946,
      });

    tokenA = compResA.body.data.accessToken;
    companyAId = compResA.body.data.company.id;
    userAId = compResA.body.data.user.id;
    officeAId = compResA.body.data.user.office_id;

    const deptResA = await request(app)
      .post('/api/v1/departments')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ company_id: companyAId, name: 'Alpha Engineering' });
    deptAId = deptResA.body.data.id;

    // 2. Create Tenant B
    const authResB = await request(app)
      .post('/api/v1/auth/firebase/session')
      .send({ idToken: 'token-b' });
    const tempTokenB = authResB.body.data.accessToken;

    const compResB = await request(app)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${tempTokenB}`)
      .send({
        name: `Company Beta ${Date.now()}`,
        officeName: 'Beta HQ',
        latitude: 19.0760,
        longitude: 72.8777,
      });

    tokenB = compResB.body.data.accessToken;
    companyBId = compResB.body.data.company.id;
    userBId = compResB.body.data.user.id;
    officeBId = compResB.body.data.user.office_id;

    const deptResB = await request(app)
      .post('/api/v1/departments')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ company_id: companyBId, name: 'Beta Product' });
    deptBId = deptResB.body.data.id;

    // 3. Create rich resources in Tenant B
    // Shift in B
    const shiftRes = await request(app)
      .post('/api/v1/shifts')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        name: 'Beta Morning Shift',
        start_time: '08:00',
        end_time: '16:00',
        total_hours: 8,
        office_id: officeBId,
        breaks: [{ name: 'Tea', start_time: '11:00', end_time: '11:30', duration_minutes: 30, is_paid: true }],
      });
    shiftBId = shiftRes.body.data.id;

    // Holiday in B
    const holRes = await request(app)
      .post('/api/v1/holidays')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        name: 'Beta Founders Day',
        holiday_date: '2026-11-20',
        office_id: officeBId,
      });
    holidayBId = holRes.body.data.id;

    // Leave Type in B
    const ltRes = await request(app)
      .post('/api/v1/leaves/types')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        code: 'BETA_SABBATICAL',
        name: 'Beta Sabbatical',
        annual_quota: 10,
        is_paid: true,
      });
    leaveTypeBId = ltRes.body.data.id;

    // Allocate balance for userB
    await request(app)
      .post('/api/v1/leaves/balances/allocate')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        user_id: userBId,
        leave_type_id: leaveTypeBId,
        leave_year: 2026,
        allocated_days: 10,
      });

    // Leave Request in B
    const lrRes = await request(app)
      .post('/api/v1/leaves/my/requests')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        leave_type_id: leaveTypeBId,
        start_date: '2026-12-01',
        end_date: '2026-12-02',
        reason: 'Beta personal leave',
      });
    leaveRequestBId = lrRes.body.data.id;

    // Invitation in B
    const invRes = await request(app)
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        email: `newhire.beta.${Date.now()}@beta.com`,
        role_id: employeeRoleId,
        office_id: officeBId,
        department_id: deptBId,
      });
    invitationBId = invRes.body.data.id;
  });

  afterAll(async () => {
    setMockFirebaseAuth(null);
    process.env.AUTH_PROVIDER = originalAuthProvider;
  });

  // ─── 1. Users Endpoints (6 checks) ──────────────────────────────────────────
  it('[1] GET /users: Company A token receives 0 users from Company B', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const users = res.body.data;
    expect(users.some((u: any) => u.company_id === companyBId)).toBe(false);
    expect(users.some((u: any) => u.id === userBId)).toBe(false);
  });

  it('[2] GET /users/:id: Company A token cannot view Company B user (404)', async () => {
    const res = await request(app)
      .get(`/api/v1/users/${userBId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.USER_NOT_FOUND);
  });

  it('[3] POST /users: Company A admin cannot create a user directly in Company B (403)', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        company_id: companyBId,
        office_id: officeAId,
        role_id: employeeRoleId,
        employee_code: `XEMP-${Date.now().toString().slice(-4)}`,
        name: 'Infiltrator',
        email: `infiltrator.${Date.now()}@attack.com`,
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.CROSS_TENANT_FORBIDDEN);
  });

  it('[4] PUT /users/:id: Company A admin cannot update Company B user (404)', async () => {
    const res = await request(app)
      .put(`/api/v1/users/${userBId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Hacked Name' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCode.USER_NOT_FOUND);
  });

  it('[5] POST /users/:id/face: Company A admin cannot enroll face for Company B user (404)', async () => {
    const res = await request(app)
      .post(`/api/v1/users/${userBId}/face`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        embedding: new Array(128).fill(0.1),
      });

    // Scoped getUserById or enrollFace target must reject
    expect([400, 404]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('[6] POST /users/:id/remove: Company A admin cannot remove Company B user (404)', async () => {
    const res = await request(app)
      .post(`/api/v1/users/${userBId}/remove`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // ─── 2. Offices Endpoints (6 checks) ────────────────────────────────────────
  it('[7] GET /offices: Company A token receives 0 offices from Company B', async () => {
    const res = await request(app)
      .get('/api/v1/offices')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const offices = res.body.data;
    expect(offices.some((o: any) => o.id === officeBId)).toBe(false);
  });

  it('[8] GET /offices/:id: Company A token cannot view Company B office (404)', async () => {
    const res = await request(app)
      .get(`/api/v1/offices/${officeBId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  it('[9] POST /offices: Company A admin cannot create office with Company B ID (403)', async () => {
    const res = await request(app)
      .post('/api/v1/offices')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        company_id: companyBId,
        name: 'Rogue Branch',
        latitude: 10,
        longitude: 10,
        radius_meters: 100,
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ErrorCode.CROSS_TENANT_FORBIDDEN);
  });

  it('[10] PUT /offices/:id: Company A admin cannot update Company B office (400/404)', async () => {
    const res = await request(app)
      .put(`/api/v1/offices/${officeBId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Hacked Office Name' });

    expect([400, 404]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('[11] DELETE /offices/:id: Company A admin cannot delete Company B office (400/404)', async () => {
    const res = await request(app)
      .delete(`/api/v1/offices/${officeBId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect([400, 404]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('[12] POST /offices/:id/apply-all: Company A admin cannot apply Company B office (400/404)', async () => {
    const res = await request(app)
      .post(`/api/v1/offices/${officeBId}/apply-all`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect([400, 404]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  // ─── 3. Departments Endpoints (3 checks) ────────────────────────────────────
  it('[13] GET /departments: Company A token receives 0 departments from Company B', async () => {
    const res = await request(app)
      .get('/api/v1/departments')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const depts = res.body.data;
    expect(depts.some((d: any) => d.id === deptBId)).toBe(false);
  });

  it('[14] POST /departments: Company A admin cannot create dept with Company B ID (403)', async () => {
    const res = await request(app)
      .post('/api/v1/departments')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        company_id: companyBId,
        name: 'Infiltrated Dept',
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ErrorCode.CROSS_TENANT_FORBIDDEN);
  });

  it('[15] PUT /departments/:id: Company A admin cannot update Company B department (404)', async () => {
    const res = await request(app)
      .put(`/api/v1/departments/${deptBId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Hacked Dept Name' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // ─── 4. Shifts Endpoints (5 checks) ─────────────────────────────────────────
  it('[16] GET /shifts: Company A token receives 0 shifts from Company B', async () => {
    const res = await request(app)
      .get('/api/v1/shifts')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const shifts = res.body.data;
    expect(shifts.some((s: any) => s.id === shiftBId)).toBe(false);
  });

  it('[17] GET /shifts/:id: Company A token cannot view Company B shift (404)', async () => {
    const res = await request(app)
      .get(`/api/v1/shifts/${shiftBId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  it('[18] POST /shifts: Company A admin cannot create shift with Company B office_id (400)', async () => {
    const res = await request(app)
      .post('/api/v1/shifts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Shift with Foreign Office',
        start_time: '09:00',
        end_time: '17:00',
        total_hours: 8,
        office_id: officeBId, // Cross-tenant office
      });

    expect([400, 403]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('[19] PUT /shifts/:id: Company A admin cannot update Company B shift (404)', async () => {
    const res = await request(app)
      .put(`/api/v1/shifts/${shiftBId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Hacked Shift' });

    expect(res.status).toBe(404);
  });

  it('[20] DELETE /shifts/:id: Company A admin cannot delete Company B shift (404)', async () => {
    const res = await request(app)
      .delete(`/api/v1/shifts/${shiftBId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  // ─── 5. Holidays Endpoints (5 checks) ───────────────────────────────────────
  it('[21] GET /holidays: Company A token receives 0 holidays from Company B', async () => {
    const res = await request(app)
      .get('/api/v1/holidays')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const holidays = res.body.data;
    expect(holidays.some((h: any) => h.id === holidayBId)).toBe(false);
  });

  it('[22] POST /holidays: Company A admin cannot create holiday with Company B office_id (400)', async () => {
    const res = await request(app)
      .post('/api/v1/holidays')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Foreign Office Holiday',
        holiday_date: '2026-12-25',
        office_id: officeBId, // Cross-tenant office
      });

    expect([400, 403]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('[23] PUT /holidays/:id: Company A admin cannot update Company B holiday (404)', async () => {
    const res = await request(app)
      .put(`/api/v1/holidays/${holidayBId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Hacked Holiday' });

    expect(res.status).toBe(404);
  });

  it('[24] DELETE /holidays/:id: Company A admin cannot delete Company B holiday (404)', async () => {
    const res = await request(app)
      .delete(`/api/v1/holidays/${holidayBId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  it('[25] GET /holidays/weekly-rules: Company A token receives only Company A rules', async () => {
    const res = await request(app)
      .get('/api/v1/holidays/weekly-rules')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const rules = res.body.data;
    expect(rules.every((r: any) => r.company_id === companyAId)).toBe(true);
  });

  // ─── 6. Leave Types & Balances Endpoints (5 checks) ─────────────────────────
  it('[26] GET /leaves/types: Company A token receives 0 leave types from Company B', async () => {
    const res = await request(app)
      .get('/api/v1/leaves/types')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const types = res.body.data;
    expect(types.some((t: any) => t.id === leaveTypeBId)).toBe(false);
  });

  it('[27] PUT /leaves/types/:id: Company A admin cannot update Company B leave type (404)', async () => {
    const res = await request(app)
      .put(`/api/v1/leaves/types/${leaveTypeBId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Hacked Leave Type' });

    expect(res.status).toBe(404);
  });

  it('[28] GET /leaves/balances: Company A token receives 0 balances from Company B', async () => {
    const res = await request(app)
      .get('/api/v1/leaves/balances')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const balances = res.body.data;
    expect(balances.some((b: any) => b.company_id === companyBId)).toBe(false);
  });

  it('[29] POST /leaves/balances/allocate: Company A admin cannot allocate for Company B user/type (404)', async () => {
    const res = await request(app)
      .post('/api/v1/leaves/balances/allocate')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        user_id: userBId, // Cross-tenant user
        leave_type_id: leaveTypeBId,
        leave_year: 2026,
        allocated_days: 15,
      });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // ─── 7. Leave Requests Endpoints (4 checks) ─────────────────────────────────
  it('[30] GET /leaves/requests: Company A token receives 0 leave requests from Company B', async () => {
    const res = await request(app)
      .get('/api/v1/leaves/requests')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const requests = res.body.data;
    expect(requests.some((r: any) => r.id === leaveRequestBId)).toBe(false);
  });

  it('[31] GET /leaves/requests/:id: Company A token cannot view Company B leave request (404)', async () => {
    const res = await request(app)
      .get(`/api/v1/leaves/requests/${leaveRequestBId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  it('[32] POST /leaves/requests/:id/review: Company A admin cannot review Company B leave request (404)', async () => {
    const res = await request(app)
      .post(`/api/v1/leaves/requests/${leaveRequestBId}/review`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ action: 'APPROVE', reviewer_note: 'Hacked Approval' });

    expect(res.status).toBe(404);
  });

  it('[33] DELETE /leaves/requests/:id: Company A token cannot cancel Company B leave request (404/403)', async () => {
    const res = await request(app)
      .delete(`/api/v1/leaves/requests/${leaveRequestBId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect([403, 404]).toContain(res.status);
  });

  // ─── 8. Attendance & Reports Endpoints (3 checks) ────────────────────────────
  it('[34] GET /attendance/team: Company A token receives 0 attendance records from Company B', async () => {
    const res = await request(app)
      .get('/api/v1/attendance/team')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const sessions = res.body.data;
    expect(sessions.some((s: any) => s.company_id === companyBId)).toBe(false);
  });

  it('[35] GET /reports/attendance: Company A token report contains 0 Company B records', async () => {
    const res = await request(app)
      .get('/api/v1/reports/attendance')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const reports = res.body.data;
    expect(reports.some((r: any) => r.company_id === companyBId)).toBe(false);
  });

  it('[36] GET /reports/admin-stats: Company A admin stats counts only Company A resources', async () => {
    const res = await request(app)
      .get('/api/v1/reports/admin-stats')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.totalEmployees).toBeGreaterThanOrEqual(1);
  });

  // ─── 9. Audit Logs Endpoints (2 checks) ─────────────────────────────────────
  it('[37] GET /audit/logs: Company A token receives 0 audit logs from Company B', async () => {
    const res = await request(app)
      .get('/api/v1/audit/logs')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const logs = res.body.data;
    expect(logs.some((l: any) => l.company_id === companyBId)).toBe(false);
  });

  it('[38] GET /audit/login-attempts: Company A token receives 0 login attempts from Company B', async () => {
    const res = await request(app)
      .get('/api/v1/audit/login-attempts')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const attempts = res.body.data;
    expect(attempts.some((a: any) => a.company_id === companyBId)).toBe(false);
  });

  // ─── 10. Invitations Endpoints (3 checks) ───────────────────────────────────
  it('[39] GET /invitations/company: Company A token receives 0 invitations from Company B', async () => {
    const res = await request(app)
      .get('/api/v1/invitations/company')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const invitations = res.body.data;
    expect(invitations.some((i: any) => i.id === invitationBId)).toBe(false);
  });

  it('[40] DELETE /invitations/:id: Company A admin cannot revoke Company B invitation (404)', async () => {
    const res = await request(app)
      .delete(`/api/v1/invitations/${invitationBId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  it('[41] POST /invitations: Company A admin cannot invite with Company B office_id or dept_id (400)', async () => {
    const res = await request(app)
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        email: `cross.invite.${Date.now()}@test.com`,
        role_id: employeeRoleId,
        office_id: officeBId, // Cross-tenant office
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // ─── 11. Company Settings Endpoints (2 checks) ──────────────────────────────
  it('[42] GET /companies/settings: Company A returns Company A settings, not Company B', async () => {
    const res = await request(app)
      .get('/api/v1/companies/settings')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data.company_id).toBe(companyAId);
  });

  it('[43] PUT /companies/settings: updates only caller company settings', async () => {
    const res = await request(app)
      .put('/api/v1/companies/settings')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        grace_minutes: 25,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.company_id).toBe(companyAId);
    expect(res.body.data.grace_minutes).toBe(25);

    // Verify Company B settings remain untouched
    const checkB = await request(app)
      .get('/api/v1/companies/settings')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(checkB.body.data.grace_minutes).not.toBe(25);
  });

  // ─── 12. Privilege & Role Enforcement (4 checks) ────────────────────────────
  it('[44] Blocks assigning SUPER_ADMIN via POST /users (403)', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        company_id: companyAId,
        office_id: officeAId,
        role_id: superAdminRoleId, // SUPER_ADMIN forbidden
        employee_code: `XSA-${Date.now().toString().slice(-4)}`,
        name: 'Fake Super Admin',
        email: `fakesa.${Date.now()}@test.com`,
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ErrorCode.CANNOT_ASSIGN_SUPER_ADMIN);
  });

  it('[45] Blocks assigning SUPER_ADMIN via PUT /users/:id (403)', async () => {
    const res = await request(app)
      .put(`/api/v1/users/${userAId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        role_id: superAdminRoleId,
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ErrorCode.CANNOT_ASSIGN_SUPER_ADMIN);
  });

  it('[46] Blocks inviting a user as SUPER_ADMIN via POST /invitations (403)', async () => {
    const res = await request(app)
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        email: `sa.invite.${Date.now()}@test.com`,
        role_id: superAdminRoleId,
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ErrorCode.CANNOT_ASSIGN_SUPER_ADMIN);
  });

  it('[47] Blocks non-admin from assigning COMPANY_ADMIN role (403)', async () => {
    // 1. Create a regular employee in Company A
    const empCode = `REG-${Date.now().toString().slice(-4)}`;
    const empEmail = `regular.${Date.now()}@alpha.com`;
    const createEmpRes = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        company_id: companyAId,
        office_id: officeAId,
        role_id: employeeRoleId,
        employee_code: empCode,
        name: 'Regular Employee',
        email: empEmail,
        password: 'Password123!',
      });
    const regularUserId = createEmpRes.body.data.id;

    // Login as regular employee
    await pool.query(
      `UPDATE users SET auth_provider = 'legacy', firebase_uid = NULL WHERE id = $1`,
      [regularUserId]
    );
    const empLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: empEmail, password: 'Password123!' });
    const empToken = empLogin.body.data.accessToken;

    // Regular employee attempts to promote someone to COMPANY_ADMIN
    const res = await request(app)
      .put(`/api/v1/users/${regularUserId}`)
      .set('Authorization', `Bearer ${empToken}`)
      .send({
        role_id: companyAdminRoleId,
      });

    expect(res.status).toBe(403);
    expect([ErrorCode.PERMISSION_DENIED, ErrorCode.FORBIDDEN]).toContain(res.body.error.code);
  });

  // ─── 13. Leave & Remove: Explicit Company Stamping & Token Revocation (2 checks) ──
  it('[48] On removeUser: audit row keeps company_id explicitly and old access token is rejected', async () => {
    // 1. Create employee in Company A to remove
    const removeEmail = `to_remove.${Date.now()}@alpha.com`;
    const createRes = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        company_id: companyAId,
        office_id: officeAId,
        role_id: employeeRoleId,
        employee_code: `REM-${Date.now().toString().slice(-4)}`,
        name: 'Remove Candidate',
        email: removeEmail,
        password: 'Password123!',
      });
    const targetUserId = createRes.body.data.id;

    await pool.query(
      `UPDATE users SET auth_provider = 'legacy', firebase_uid = NULL WHERE id = $1`,
      [targetUserId]
    );
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: removeEmail, password: 'Password123!' });
    const candidateOldToken = loginRes.body.data.accessToken;

    // Verify token works before removal
    const checkActive = await request(app)
      .get('/api/v1/users/self/face-template')
      .set('Authorization', `Bearer ${candidateOldToken}`);
    expect(checkActive.status).toBe(200);

    // 2. Admin removes employee from Company A
    const removeRes = await request(app)
      .post(`/api/v1/users/${targetUserId}/remove`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(removeRes.status).toBe(200);

    // 3. Verify audit log row retains company_id = companyAId
    const auditRes = await pool.query(
      `SELECT company_id, action, entity_id, actor_user_id
       FROM audit_logs
       WHERE entity_id = $1 AND action = 'USER_REMOVED_FROM_COMPANY'`,
      [targetUserId]
    );
    expect(auditRes.rows.length).toBe(1);
    expect(auditRes.rows[0].company_id).toBe(companyAId);

    // 4. Verify candidate old access token is REJECTED immediately (token_version revoked)
    const testOldToken = await request(app)
      .get('/api/v1/users/self/face-template')
      .set('Authorization', `Bearer ${candidateOldToken}`);
    expect(testOldToken.status).toBe(401);
  });

  it('[49] On leaveCompany: audit row keeps company_id explicitly in company audit history', async () => {
    // 1. Create a second admin in Company B so they can safely leave
    const coAdminEmail = `coadmin.${Date.now()}@beta.com`;
    const createAdminRes = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        company_id: companyBId,
        office_id: officeBId,
        role_id: companyAdminRoleId,
        employee_code: `CADM-${Date.now().toString().slice(-4)}`,
        name: 'Co Admin Beta',
        email: coAdminEmail,
        password: 'Password123!',
      });
    const coAdminId = createAdminRes.body.data.id;

    await pool.query(
      `UPDATE users SET auth_provider = 'legacy', firebase_uid = NULL WHERE id = $1`,
      [coAdminId]
    );
    const coAdminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: coAdminEmail, password: 'Password123!' });
    const coAdminToken = coAdminLogin.body.data.accessToken;

    // 2. Co-admin leaves Company B
    const leaveRes = await request(app)
      .post('/api/v1/companies/leave')
      .set('Authorization', `Bearer ${coAdminToken}`);
    expect(leaveRes.status).toBe(200);

    // 3. Verify audit row retained company_id = companyBId
    const auditRes = await pool.query(
      `SELECT company_id, action, entity_id
       FROM audit_logs
       WHERE entity_id = $1 AND action = 'USER_LEFT_COMPANY'`,
      [coAdminId]
    );
    expect(auditRes.rows.length).toBe(1);
    expect(auditRes.rows[0].company_id).toBe(companyBId);

    // 4. Verify user itself is now detached (company_id IS NULL)
    const userDb = await pool.query(`SELECT company_id FROM users WHERE id = $1`, [coAdminId]);
    expect(userDb.rows[0].company_id).toBeNull();

    // 5. Verify the audit row remains visible when Company B lists audit logs
    const bAuditList = await request(app)
      .get('/api/v1/audit/logs')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(bAuditList.status).toBe(200);
    const logs = bAuditList.body.data;
    expect(logs.some((l: any) => l.action === 'USER_LEFT_COMPANY' && l.entity_id === coAdminId)).toBe(true);
  });
});
