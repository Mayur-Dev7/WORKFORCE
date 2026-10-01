-- ============================================================
-- Migration 005: Work Shifts & Office Break Schedules
-- Additive only — supports configurable office hours and breaks
-- ============================================================

-- 1. Work Shifts table
CREATE TABLE IF NOT EXISTS work_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    -- Optional: link to a specific office; NULL means company-wide default
    office_id UUID
        REFERENCES offices(id)
        ON DELETE SET NULL,

    name TEXT NOT NULL,
    start_time TIME NOT NULL DEFAULT '09:00:00',
    end_time TIME NOT NULL DEFAULT '17:00:00',
    total_hours NUMERIC(4,2) NOT NULL DEFAULT 8.00,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (total_hours > 0)
);

-- 2. Shift Breaks table
CREATE TABLE IF NOT EXISTS shift_breaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    shift_id UUID NOT NULL
        REFERENCES work_shifts(id)
        ON DELETE CASCADE,

    name TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration_minutes INTEGER NOT NULL,
    is_paid BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (duration_minutes > 0)
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_work_shifts_company ON work_shifts(company_id);
CREATE INDEX IF NOT EXISTS idx_work_shifts_office ON work_shifts(office_id);
CREATE INDEX IF NOT EXISTS idx_shift_breaks_shift ON shift_breaks(shift_id);

-- 3. Insert Permissions into permissions table
INSERT INTO permissions (key, description)
VALUES 
    ('shift:read', 'View office work shifts and break schedules'),
    ('shift:manage', 'Configure office work hours and scheduled break intervals')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

-- 4. Grant new permissions to SUPER_ADMIN role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'SUPER_ADMIN'
  AND p.key IN ('shift:read', 'shift:manage')
ON CONFLICT DO NOTHING;

-- 5. Seed default 8-hour shift with 1-hour lunch break for existing companies
DO $$
DECLARE
  comp_rec RECORD;
  new_shift_id UUID;
BEGIN
  FOR comp_rec IN SELECT id FROM companies LOOP
    IF NOT EXISTS (SELECT 1 FROM work_shifts WHERE company_id = comp_rec.id) THEN
      INSERT INTO work_shifts (company_id, office_id, name, start_time, end_time, total_hours, is_default)
      VALUES (comp_rec.id, NULL, 'Standard 8-Hour Shift', '09:00:00', '17:00:00', 8.00, TRUE)
      RETURNING id INTO new_shift_id;

      INSERT INTO shift_breaks (shift_id, name, start_time, end_time, duration_minutes, is_paid)
      VALUES (new_shift_id, 'Lunch Break', '13:00:00', '14:00:00', 60, FALSE);
    END IF;
  END LOOP;
END$$;
