import bcrypt from 'bcrypt';
import { pool } from '../../src/lib/db.js';
import { RoleName, PermissionKey } from '@workforce/shared';

// 1024-dimension normalized face embedding matching @vladmandic/human MobileFaceNet/InsightFace
export function generateSyntheticEmbedding(seedNum = 1): number[] {
  const raw: number[] = [];
  for (let i = 0; i < 1024; i++) {
    raw.push(Math.sin(i * seedNum + 1) * Math.cos(seedNum));
  }
  const norm = Math.sqrt(raw.reduce((sum, val) => sum + val * val, 0));
  return raw.map((v) => Number((v / norm).toFixed(6)));
}

export async function runSeed(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('🌱 Starting database seed...');

    // 1. Company
    const companyRes = await client.query<{ id: string }>(`
      INSERT INTO companies (name)
      VALUES ('Acme Global Workforce')
      ON CONFLICT (name) DO NOTHING
      RETURNING id;
    `);

    let companyId = companyRes.rows[0]?.id;
    if (!companyId) {
      const existing = await client.query<{ id: string }>(`SELECT id FROM companies WHERE name = 'Acme Global Workforce' LIMIT 1`);
      companyId = existing.rows[0].id;
    }

    // 2. Offices
    const office1Res = await client.query<{ id: string }>(`
      INSERT INTO offices (company_id, name, address, latitude, longitude, radius_meters)
      VALUES ($1, 'Tech Park HQ (San Francisco)', '500 Howard St, San Francisco, CA', 37.774929, -122.419416, 200)
      RETURNING id;
    `, [companyId]);
    const office1Id = office1Res.rows[0].id;

    const office2Res = await client.query<{ id: string }>(`
      INSERT INTO offices (company_id, name, address, latitude, longitude, radius_meters)
      VALUES ($1, 'Silicon Valley Innovation Hub (Palo Alto)', '250 University Ave, Palo Alto, CA', 37.441883, -122.143019, 250)
      RETURNING id;
    `, [companyId]);
    const office2Id = office2Res.rows[0].id;

    // 3. Departments
    const dept1Res = await client.query<{ id: string }>(`
      INSERT INTO departments (company_id, name)
      VALUES ($1, 'Engineering & Product')
      ON CONFLICT (company_id, name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `, [companyId]);
    const dept1Id = dept1Res.rows[0].id;

    const dept2Res = await client.query<{ id: string }>(`
      INSERT INTO departments (company_id, name)
      VALUES ($1, 'People & Operations')
      ON CONFLICT (company_id, name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `, [companyId]);
    const dept2Id = dept2Res.rows[0].id;

    // 4. Permissions
    const allPermissions = [
      { key: PermissionKey.USER_CREATE, desc: 'Create employees' },
      { key: PermissionKey.USER_READ, desc: 'View employees' },
      { key: PermissionKey.USER_UPDATE, desc: 'Update employees' },
      { key: PermissionKey.USER_DISABLE, desc: 'Disable/enable employees' },

      { key: PermissionKey.FACE_ENROLL, desc: 'Enroll biometric face profile' },
      { key: PermissionKey.FACE_REPLACE, desc: 'Replace biometric face profile' },

      { key: PermissionKey.OFFICE_CREATE, desc: 'Create office location' },
      { key: PermissionKey.OFFICE_READ, desc: 'View office locations' },
      { key: PermissionKey.OFFICE_UPDATE, desc: 'Update office details and geofence' },
      { key: PermissionKey.OFFICE_DISABLE, desc: 'Activate/deactivate office' },

      { key: PermissionKey.DEPARTMENT_CREATE, desc: 'Create department' },
      { key: PermissionKey.DEPARTMENT_READ, desc: 'View departments' },
      { key: PermissionKey.DEPARTMENT_UPDATE, desc: 'Update department' },

      { key: PermissionKey.ATTENDANCE_CHECKIN, desc: 'Self check-in attendance' },
      { key: PermissionKey.ATTENDANCE_CHECKOUT, desc: 'Self check-out attendance' },
      { key: PermissionKey.ATTENDANCE_READ, desc: 'View own attendance history' },
      { key: PermissionKey.ATTENDANCE_READ_TEAM, desc: 'View team attendance' },

      { key: PermissionKey.REPORTS_READ, desc: 'View attendance reports and analytics' },
      { key: PermissionKey.REPORTS_EXPORT, desc: 'Export reports to CSV' },

      { key: PermissionKey.AUDIT_READ, desc: 'View audit logs' },

      { key: PermissionKey.ROLE_READ, desc: 'View roles and permissions' },
      { key: PermissionKey.ROLE_UPDATE, desc: 'Update role permissions' },

      // Leave Management
      { key: PermissionKey.LEAVE_APPLY, desc: 'Apply for leave' },
      { key: PermissionKey.LEAVE_READ_OWN, desc: 'View own leave requests and balances' },
      { key: PermissionKey.LEAVE_READ_TEAM, desc: 'View all company leave requests and balances' },
      { key: PermissionKey.LEAVE_APPROVE, desc: 'Approve or reject leave requests' },
      { key: PermissionKey.LEAVE_TYPE_MANAGE, desc: 'Manage leave types and allocate balances' },

      // Holiday Calendar
      { key: PermissionKey.HOLIDAY_READ, desc: 'View holiday calendar' },
      { key: PermissionKey.HOLIDAY_MANAGE, desc: 'Create, update and delete holidays and weekly rules' },

      // Work Shifts & Breaks
      { key: PermissionKey.SHIFT_READ, desc: 'View office work shifts and break schedules' },
      { key: PermissionKey.SHIFT_MANAGE, desc: 'Configure office work hours and scheduled break intervals' },
    ];

    for (const p of allPermissions) {
      await client.query(`
        INSERT INTO permissions (key, description)
        VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;
      `, [p.key, p.desc]);
    }

    // 5. Roles
    const rolesData = [
      { name: RoleName.SUPER_ADMIN, desc: 'Full administrative access' },
      { name: RoleName.HR_ADMIN, desc: 'HR and workforce management' },
      { name: RoleName.MANAGER, desc: 'Team supervisor and approval access' },
      { name: RoleName.EMPLOYEE, desc: 'Standard employee access' },
    ];

    const roleMap: Record<string, string> = {};

    for (const r of rolesData) {
      const res = await client.query<{ id: string }>(`
        INSERT INTO roles (name, description)
        VALUES ($1, $2)
        ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
        RETURNING id;
      `, [r.name, r.desc]);
      roleMap[r.name] = res.rows[0].id;
    }

    // 6. Role Permissions mapping
    // SUPER_ADMIN gets all
    await client.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT $1, id FROM permissions
      ON CONFLICT DO NOTHING;
    `, [roleMap[RoleName.SUPER_ADMIN]]);

    // HR_ADMIN
    const hrPerms = [
      PermissionKey.USER_CREATE,
      PermissionKey.USER_READ,
      PermissionKey.USER_UPDATE,
      PermissionKey.USER_DISABLE,
      PermissionKey.FACE_ENROLL,
      PermissionKey.FACE_REPLACE,
      PermissionKey.OFFICE_READ,
      PermissionKey.DEPARTMENT_READ,
      PermissionKey.DEPARTMENT_CREATE,
      PermissionKey.DEPARTMENT_UPDATE,
      PermissionKey.ATTENDANCE_CHECKIN,
      PermissionKey.ATTENDANCE_CHECKOUT,
      PermissionKey.ATTENDANCE_READ,
      PermissionKey.ATTENDANCE_READ_TEAM,
      PermissionKey.REPORTS_READ,
      PermissionKey.REPORTS_EXPORT,
      PermissionKey.AUDIT_READ,
      PermissionKey.ROLE_READ,
      // Leave & Holiday
      PermissionKey.LEAVE_APPLY,
      PermissionKey.LEAVE_READ_OWN,
      PermissionKey.LEAVE_READ_TEAM,
      PermissionKey.LEAVE_APPROVE,
      PermissionKey.LEAVE_TYPE_MANAGE,
      PermissionKey.HOLIDAY_READ,
      PermissionKey.HOLIDAY_MANAGE,
      // Work Shifts
      PermissionKey.SHIFT_READ,
      PermissionKey.SHIFT_MANAGE,
    ];
    await client.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT $1, id FROM permissions WHERE key = ANY($2::text[])
      ON CONFLICT DO NOTHING;
    `, [roleMap[RoleName.HR_ADMIN], hrPerms]);

    // MANAGER
    const managerPerms = [
      PermissionKey.USER_READ,
      PermissionKey.OFFICE_READ,
      PermissionKey.DEPARTMENT_READ,
      PermissionKey.ATTENDANCE_CHECKIN,
      PermissionKey.ATTENDANCE_CHECKOUT,
      PermissionKey.ATTENDANCE_READ,
      PermissionKey.ATTENDANCE_READ_TEAM,
      PermissionKey.REPORTS_READ,
      // Leave & Holiday
      PermissionKey.LEAVE_APPLY,
      PermissionKey.LEAVE_READ_OWN,
      PermissionKey.LEAVE_READ_TEAM,
      PermissionKey.LEAVE_APPROVE,
      PermissionKey.HOLIDAY_READ,
      // Work Shifts
      PermissionKey.SHIFT_READ,
    ];
    await client.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT $1, id FROM permissions WHERE key = ANY($2::text[])
      ON CONFLICT DO NOTHING;
    `, [roleMap[RoleName.MANAGER], managerPerms]);

    // EMPLOYEE
    const employeePerms = [
      PermissionKey.USER_READ,
      PermissionKey.OFFICE_READ,
      PermissionKey.ATTENDANCE_CHECKIN,
      PermissionKey.ATTENDANCE_CHECKOUT,
      PermissionKey.ATTENDANCE_READ,
      // Leave & Holiday
      PermissionKey.LEAVE_APPLY,
      PermissionKey.LEAVE_READ_OWN,
      PermissionKey.HOLIDAY_READ,
      // Work Shifts
      PermissionKey.SHIFT_READ,
    ];
    await client.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT $1, id FROM permissions WHERE key = ANY($2::text[])
      ON CONFLICT DO NOTHING;
    `, [roleMap[RoleName.EMPLOYEE], employeePerms]);


    // 7. Seed Users
    const passwordHash = await bcrypt.hash('Password123!', 10);

    const usersToSeed = [
      {
        code: 'EMP-001',
        name: 'Sarah Connor (Super Admin)',
        email: 'superadmin@workforce.com',
        role: RoleName.SUPER_ADMIN,
        deptId: dept2Id,
        officeId: office1Id,
        faceEnrolled: false,
      },
      {
        code: 'EMP-002',
        name: 'Elena Ramos (HR Admin)',
        email: 'hr@workforce.com',
        role: RoleName.HR_ADMIN,
        deptId: dept2Id,
        officeId: office1Id,
        faceEnrolled: false,
      },
      {
        code: 'EMP-003',
        name: 'Marcus Vance (Engineering Manager)',
        email: 'manager@workforce.com',
        role: RoleName.MANAGER,
        deptId: dept1Id,
        officeId: office1Id,
        faceEnrolled: false,
      },
      {
        code: 'EMP-101',
        name: 'Alex Mercer (Senior Dev)',
        email: 'alex@workforce.com',
        role: RoleName.EMPLOYEE,
        deptId: dept1Id,
        officeId: office1Id,
        faceEnrolled: true,
      },
      {
        code: 'EMP-102',
        name: 'Jessica Chen (Frontend Dev)',
        email: 'jessica@workforce.com',
        role: RoleName.EMPLOYEE,
        deptId: dept1Id,
        officeId: office1Id,
        faceEnrolled: false,
      },
      {
        code: 'EMP-103',
        name: 'David Kim (QA Engineer)',
        email: 'david@workforce.com',
        role: RoleName.EMPLOYEE,
        deptId: dept1Id,
        officeId: office2Id,
        faceEnrolled: false,
      },
    ];

    for (const u of usersToSeed) {
      const userRes = await client.query<{ id: string }>(`
        INSERT INTO users (
          company_id, office_id, department_id, role_id,
          employee_code, name, email, password_hash, is_active, face_enrolled
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)
        ON CONFLICT (company_id, employee_code)
        DO UPDATE SET
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          office_id = EXCLUDED.office_id,
          department_id = EXCLUDED.department_id,
          role_id = EXCLUDED.role_id,
          face_enrolled = EXCLUDED.face_enrolled
        RETURNING id;
      `, [
        companyId,
        u.officeId,
        u.deptId,
        roleMap[u.role],
        u.code,
        u.name,
        u.email,
        passwordHash,
        u.faceEnrolled,
      ]);

      const userId = userRes.rows[0].id;

      // If faceEnrolled, seed face template for Alex Mercer
      if (u.faceEnrolled) {
        const syntheticEmbedding = generateSyntheticEmbedding(42);
        await client.query(`
          INSERT INTO face_templates (user_id, embedding, model_name, model_version)
          VALUES ($1, $2, '@vladmandic/human', '3.2.0')
          ON CONFLICT (user_id) DO UPDATE SET
            embedding = EXCLUDED.embedding,
            updated_at = NOW();
        `, [userId, syntheticEmbedding]);
      }
    }

    // 8. Seed Leave Types (CASUAL + SICK) — safe to run multiple times (ON CONFLICT DO UPDATE)
    console.log('🌱 Seeding leave types...');
    const defaultLeaveTypes = [
      { code: 'CASUAL', name: 'Casual Leave', annual_quota: 12, is_paid: false },
      { code: 'SICK',   name: 'Sick Leave',   annual_quota: 5,  is_paid: false },
    ];
    for (const lt of defaultLeaveTypes) {
      await client.query(`
        INSERT INTO leave_types (company_id, code, name, annual_quota, is_paid)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (company_id, code) DO UPDATE
          SET name = EXCLUDED.name,
              annual_quota = EXCLUDED.annual_quota,
              is_paid = EXCLUDED.is_paid,
              updated_at = NOW();
      `, [companyId, lt.code, lt.name, lt.annual_quota, lt.is_paid]);
    }

    await client.query('COMMIT');
    console.log('✅ Database seed completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to seed database:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Execute when run directly via tsx
if (process.argv[1]?.endsWith('seed.ts')) {
  runSeed()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async () => {
      await pool.end();
      process.exit(1);
    });
}
