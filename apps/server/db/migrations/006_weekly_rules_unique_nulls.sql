-- ============================================================
-- Migration 006: Fix Weekly Holiday Rules Unique Constraint
-- PostgreSQL standard treats NULL != NULL in UNIQUE constraints unless NULLS NOT DISTINCT is specified.
-- This caused duplicate rows to accumulate whenever week_of_month is NULL.
-- ============================================================

-- 1. Deduplicate existing rows in weekly_holiday_rules, keeping the latest updated row
DELETE FROM weekly_holiday_rules a
USING weekly_holiday_rules b
WHERE a.company_id = b.company_id
  AND a.day_of_week = b.day_of_week
  AND a.week_of_month IS NOT DISTINCT FROM b.week_of_month
  AND (a.updated_at < b.updated_at OR (a.updated_at = b.updated_at AND a.id < b.id));

-- 2. Drop the old unique constraint
ALTER TABLE weekly_holiday_rules
  DROP CONSTRAINT IF EXISTS weekly_holiday_rules_company_id_day_of_week_week_of_month_key;

-- 3. Re-add unique constraint with NULLS NOT DISTINCT
ALTER TABLE weekly_holiday_rules
  ADD CONSTRAINT weekly_holiday_rules_company_id_day_of_week_week_of_month_key
  UNIQUE NULLS NOT DISTINCT (company_id, day_of_week, week_of_month);
