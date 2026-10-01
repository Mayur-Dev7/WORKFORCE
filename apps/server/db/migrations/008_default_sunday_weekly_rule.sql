-- Up Migration

-- Ensure all existing companies have default Sunday weekly holiday rule if none configured
INSERT INTO weekly_holiday_rules (company_id, day_of_week, week_of_month, is_active)
SELECT c.id, 0, NULL, true
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM weekly_holiday_rules r WHERE r.company_id = c.id
)
ON CONFLICT (company_id, day_of_week, week_of_month) DO NOTHING;

-- Down Migration

-- No-op: we retain existing weekly rules on rollback to prevent accidental data loss.
