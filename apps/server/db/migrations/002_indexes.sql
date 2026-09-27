-- Concurrency rule: enforce at database level that a user can have at most one open attendance session
CREATE UNIQUE INDEX IF NOT EXISTS one_open_attendance_session_per_user
ON attendance_sessions(user_id)
WHERE check_out_at IS NULL;

-- Attendance session lookup indexes
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_user_id ON attendance_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_office_id ON attendance_sessions(office_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_check_in_at ON attendance_sessions(check_in_at);

-- User indexes
CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_users_office_id ON users(office_id);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_department_id ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_employee_code ON users(employee_code);

-- Audit log indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Login attempts indexes
CREATE INDEX IF NOT EXISTS idx_login_attempts_user_id ON login_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_login_attempts_created_at ON login_attempts(created_at);
