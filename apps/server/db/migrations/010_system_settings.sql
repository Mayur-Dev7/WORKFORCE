-- Up Migration
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed key 'bootstrap' with completed=TRUE if ANY user with role SUPER_ADMIN already exists at migration time, else completed=false
DO $$
DECLARE
    has_super_admin BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM users u
        JOIN roles r ON u.role_id = r.id
        WHERE r.name = 'SUPER_ADMIN'
    ) INTO has_super_admin;

    IF has_super_admin THEN
        INSERT INTO system_settings (key, value)
        VALUES ('bootstrap', jsonb_build_object('completed', true, 'completed_at', NOW()))
        ON CONFLICT (key) DO NOTHING;
    ELSE
        INSERT INTO system_settings (key, value)
        VALUES ('bootstrap', jsonb_build_object('completed', false, 'completed_at', NULL))
        ON CONFLICT (key) DO NOTHING;
    END IF;
END $$;

-- DB trigger that REJECTS any update changing completed from true to false or clearing completed_at. Also rejects DELETE of this row.
CREATE OR REPLACE FUNCTION protect_system_settings_bootstrap()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.key = 'bootstrap' THEN
            RAISE EXCEPTION 'Deletion of bootstrap system setting is strictly prohibited.';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        NEW.updated_at = NOW();
        IF OLD.key = 'bootstrap' THEN
            IF (OLD.value->>'completed')::boolean = true AND (NEW.value->>'completed')::boolean = false THEN
                RAISE EXCEPTION 'Resetting bootstrap.completed from true to false is strictly prohibited.';
            END IF;
            IF (OLD.value->>'completed_at') IS NOT NULL AND (NEW.value->>'completed_at') IS NULL THEN
                RAISE EXCEPTION 'Clearing bootstrap.completed_at is strictly prohibited.';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_system_settings_bootstrap ON system_settings;
CREATE TRIGGER trg_protect_system_settings_bootstrap
BEFORE UPDATE OR DELETE ON system_settings
FOR EACH ROW
EXECUTE FUNCTION protect_system_settings_bootstrap();

-- Down Migration
DROP TRIGGER IF EXISTS trg_protect_system_settings_bootstrap ON system_settings;
DROP FUNCTION IF EXISTS protect_system_settings_bootstrap();
DROP TABLE IF EXISTS system_settings;
