-- Up Migration

-- 1. Clean up unused system_settings from initial prototype
DROP TRIGGER IF EXISTS trg_protect_system_settings_bootstrap ON system_settings;
DROP FUNCTION IF EXISTS protect_system_settings_bootstrap();
DROP TABLE IF EXISTS system_settings CASCADE;

-- 2. Add COMPANY_ADMIN role and grant all company permissions
INSERT INTO roles (name, description)
VALUES ('COMPANY_ADMIN', 'Full administrative access for the company')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r_new.id, rp.permission_id
FROM roles r_new
JOIN roles r_old ON r_old.name = 'SUPER_ADMIN'
JOIN role_permissions rp ON rp.role_id = r_old.id
WHERE r_new.name = 'COMPANY_ADMIN'
ON CONFLICT DO NOTHING;

-- 3. Migrate all existing SUPER_ADMIN users with a company to COMPANY_ADMIN
UPDATE users
SET role_id = (SELECT id FROM roles WHERE name = 'COMPANY_ADMIN')
WHERE role_id = (SELECT id FROM roles WHERE name = 'SUPER_ADMIN')
  AND company_id IS NOT NULL;

-- 4. Companies table additions
ALTER TABLE companies ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE companies c
SET owner_user_id = u.id
FROM (
    SELECT DISTINCT ON (company_id) id, company_id
    FROM users
    WHERE role_id = (SELECT id FROM roles WHERE name = 'COMPANY_ADMIN')
      AND is_active = true
    ORDER BY company_id, created_at ASC
) u
WHERE c.id = u.company_id AND c.owner_user_id IS NULL;

-- 5. Company Settings table
CREATE TABLE IF NOT EXISTS company_settings (
    company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    work_start_time TIME NOT NULL DEFAULT '09:00:00',
    work_end_time TIME NOT NULL DEFAULT '18:00:00',
    grace_minutes INTEGER NOT NULL DEFAULT 15,
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    weekly_off_days INTEGER[] NOT NULL DEFAULT '{0}',
    casual_leaves_per_year NUMERIC(5,2) NOT NULL DEFAULT 12.00,
    sick_leaves_per_year NUMERIC(5,2) NOT NULL DEFAULT 12.00,
    leave_year_start_month INTEGER NOT NULL DEFAULT 1,
    extra_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO company_settings (company_id)
SELECT id FROM companies
ON CONFLICT (company_id) DO NOTHING;

-- 6. Users table modifications
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_for_firebase_link BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE users ALTER COLUMN office_id DROP NOT NULL;
ALTER TABLE users ALTER COLUMN role_id DROP NOT NULL;
ALTER TABLE users ALTER COLUMN employee_code DROP NOT NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_company_id_email_key;
DROP INDEX IF EXISTS uidx_users_email_lower;
CREATE UNIQUE INDEX IF NOT EXISTS uidx_users_email_lower ON users (LOWER(TRIM(email)));

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_company_membership;
ALTER TABLE users ADD CONSTRAINT chk_users_company_membership CHECK (
    (company_id IS NULL AND office_id IS NULL AND role_id IS NULL) OR
    (company_id IS NOT NULL AND office_id IS NOT NULL AND role_id IS NOT NULL)
);

-- 7. Invitations table
CREATE TABLE IF NOT EXISTS invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    office_id UUID REFERENCES offices(id) ON DELETE SET NULL,
    invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    accepted_at TIMESTAMPTZ,
    accepted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_invitations_company_email_pending
ON invitations (company_id, LOWER(TRIM(email)))
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_invitations_email_status ON invitations (LOWER(TRIM(email)), status);

-- 8. Tenant-Stamp History columns
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS auto_closed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS auto_close_reason TEXT;

ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Backfill history tables from users and leave_types
UPDATE attendance_sessions s
SET company_id = u.company_id
FROM users u
WHERE s.user_id = u.id AND s.company_id IS NULL;

UPDATE leave_requests lr
SET company_id = u.company_id
FROM users u
WHERE lr.user_id = u.id AND lr.company_id IS NULL;

UPDATE leave_balances lb
SET company_id = lt.company_id
FROM leave_types lt
WHERE lb.leave_type_id = lt.id AND lb.company_id IS NULL;

UPDATE audit_logs al
SET company_id = u.company_id
FROM users u
WHERE al.actor_user_id = u.id AND al.company_id IS NULL;

UPDATE login_attempts la
SET company_id = u.company_id
FROM users u
WHERE la.user_id = u.id AND la.company_id IS NULL;

-- Enforce NOT NULL on primary history tables
ALTER TABLE attendance_sessions ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE leave_requests ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE leave_balances ALTER COLUMN company_id SET NOT NULL;

-- Indexes for tenant-isolated queries
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_company_id ON attendance_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_company_id ON leave_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_leave_balances_company_id ON leave_balances(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id ON audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_login_attempts_company_id ON login_attempts(company_id);

-- 9. BEFORE INSERT Triggers for Rolling Deploy Compatibility
CREATE OR REPLACE FUNCTION trg_fn_stamp_company_id_from_user()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.company_id IS NULL THEN
        IF TG_TABLE_NAME = 'audit_logs' THEN
            SELECT company_id INTO NEW.company_id FROM users WHERE id = NEW.actor_user_id;
        ELSIF TG_TABLE_NAME = 'leave_balances' THEN
            SELECT company_id INTO NEW.company_id FROM leave_types WHERE id = NEW.leave_type_id;
        ELSE
            SELECT company_id INTO NEW.company_id FROM users WHERE id = NEW.user_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stamp_attendance_company ON attendance_sessions;
CREATE TRIGGER trg_stamp_attendance_company
BEFORE INSERT ON attendance_sessions
FOR EACH ROW EXECUTE FUNCTION trg_fn_stamp_company_id_from_user();

DROP TRIGGER IF EXISTS trg_stamp_leave_requests_company ON leave_requests;
CREATE TRIGGER trg_stamp_leave_requests_company
BEFORE INSERT ON leave_requests
FOR EACH ROW EXECUTE FUNCTION trg_fn_stamp_company_id_from_user();

DROP TRIGGER IF EXISTS trg_stamp_leave_balances_company ON leave_balances;
CREATE TRIGGER trg_stamp_leave_balances_company
BEFORE INSERT ON leave_balances
FOR EACH ROW EXECUTE FUNCTION trg_fn_stamp_company_id_from_user();

DROP TRIGGER IF EXISTS trg_stamp_audit_logs_company ON audit_logs;
CREATE TRIGGER trg_stamp_audit_logs_company
BEFORE INSERT ON audit_logs
FOR EACH ROW EXECUTE FUNCTION trg_fn_stamp_company_id_from_user();

DROP TRIGGER IF EXISTS trg_stamp_login_attempts_company ON login_attempts;
CREATE TRIGGER trg_stamp_login_attempts_company
BEFORE INSERT ON login_attempts
FOR EACH ROW EXECUTE FUNCTION trg_fn_stamp_company_id_from_user();

-- Down Migration

DROP TRIGGER IF EXISTS trg_stamp_login_attempts_company ON login_attempts;
DROP TRIGGER IF EXISTS trg_stamp_audit_logs_company ON audit_logs;
DROP TRIGGER IF EXISTS trg_stamp_leave_balances_company ON leave_balances;
DROP TRIGGER IF EXISTS trg_stamp_leave_requests_company ON leave_requests;
DROP TRIGGER IF EXISTS trg_stamp_attendance_company ON attendance_sessions;
DROP FUNCTION IF EXISTS trg_fn_stamp_company_id_from_user();

DROP TABLE IF EXISTS invitations CASCADE;
DROP TABLE IF EXISTS company_settings CASCADE;

ALTER TABLE attendance_sessions DROP COLUMN IF EXISTS auto_close_reason;
ALTER TABLE attendance_sessions DROP COLUMN IF EXISTS auto_closed;
ALTER TABLE attendance_sessions DROP COLUMN IF EXISTS company_id;
ALTER TABLE leave_requests DROP COLUMN IF EXISTS company_id;
ALTER TABLE leave_balances DROP COLUMN IF EXISTS company_id;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS company_id;
ALTER TABLE login_attempts DROP COLUMN IF EXISTS company_id;

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_company_membership;
DROP INDEX IF EXISTS uidx_users_email_lower;
ALTER TABLE users ADD CONSTRAINT users_company_id_email_key UNIQUE (company_id, email);

ALTER TABLE users DROP COLUMN IF EXISTS approved_for_firebase_link;
ALTER TABLE users DROP COLUMN IF EXISTS token_version;

ALTER TABLE companies DROP COLUMN IF EXISTS is_active;
ALTER TABLE companies DROP COLUMN IF EXISTS owner_user_id;
