-- ============================================================
-- Migration 004: Leave Management + Holiday Calendar
-- Additive only — no existing table is modified or dropped
-- ============================================================

-- Leave status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'leave_status') THEN
    CREATE TYPE leave_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
  END IF;
END$$;

-- Leave Types
CREATE TABLE IF NOT EXISTS leave_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    code TEXT NOT NULL,
    name TEXT NOT NULL,

    annual_quota NUMERIC(5,2) NOT NULL,

    is_paid BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(company_id, code),

    CHECK (annual_quota >= 0)
);

-- Leave Balances
CREATE TABLE IF NOT EXISTS leave_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    leave_type_id UUID NOT NULL
        REFERENCES leave_types(id)
        ON DELETE CASCADE,

    leave_year INTEGER NOT NULL
        CHECK (leave_year BETWEEN 2000 AND 2100),

    allocated_days NUMERIC(5,2) NOT NULL DEFAULT 0,
    used_days NUMERIC(5,2) NOT NULL DEFAULT 0,
    pending_days NUMERIC(5,2) NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(user_id, leave_type_id, leave_year),

    CHECK (allocated_days >= 0),
    CHECK (used_days >= 0),
    CHECK (pending_days >= 0)
);

-- Leave Requests
CREATE TABLE IF NOT EXISTS leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    leave_type_id UUID NOT NULL
        REFERENCES leave_types(id)
        ON DELETE RESTRICT,

    start_date DATE NOT NULL,
    end_date DATE NOT NULL,

    days_requested NUMERIC(5,2) NOT NULL,

    status leave_status NOT NULL DEFAULT 'PENDING',

    reason TEXT,

    reviewed_by UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    reviewed_at TIMESTAMPTZ,
    reviewer_note TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (end_date >= start_date),
    CHECK (days_requested > 0)
);

-- Holidays
CREATE TABLE IF NOT EXISTS holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    -- Optional: restrict holiday to a specific office
    office_id UUID
        REFERENCES offices(id)
        ON DELETE CASCADE,

    name TEXT NOT NULL,
    description TEXT,

    holiday_date DATE NOT NULL,

    -- If true, recurs every year on the same month+day
    is_recurring BOOLEAN NOT NULL DEFAULT FALSE,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique index: one non-recurring holiday per company per date
CREATE UNIQUE INDEX IF NOT EXISTS uidx_holidays_company_date_nonrecurring
    ON holidays (company_id, holiday_date)
    WHERE is_recurring = FALSE AND office_id IS NULL;

-- Partial unique index: one non-recurring holiday per office per date
CREATE UNIQUE INDEX IF NOT EXISTS uidx_holidays_office_date_nonrecurring
    ON holidays (office_id, holiday_date)
    WHERE is_recurring = FALSE AND office_id IS NOT NULL;

-- Weekly Holiday Rules
-- Example: 2nd and 4th Saturday are holidays
CREATE TABLE IF NOT EXISTS weekly_holiday_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    -- 0 = Sunday, 1 = Monday, ..., 6 = Saturday (ISO: 1=Mon..7=Sun)
    -- We use JS convention 0–6 for compatibility
    day_of_week SMALLINT NOT NULL
        CHECK (day_of_week BETWEEN 0 AND 6),

    -- NULL means ALL occurrences of this weekday
    -- 1,2,3,4,5 means 1st,2nd,3rd,4th,5th occurrence in a month
    week_of_month SMALLINT
        CHECK (week_of_month BETWEEN 1 AND 5),

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(company_id, day_of_week, week_of_month)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_leave_requests_user_id ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON leave_requests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_leave_balances_user_year ON leave_balances(user_id, leave_year);
CREATE INDEX IF NOT EXISTS idx_holidays_company_date ON holidays(company_id, holiday_date);
CREATE INDEX IF NOT EXISTS idx_holidays_office_date ON holidays(office_id, holiday_date) WHERE office_id IS NOT NULL;
