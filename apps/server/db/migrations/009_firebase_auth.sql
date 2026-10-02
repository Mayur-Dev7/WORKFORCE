-- Up Migration
ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(128);
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) NOT NULL DEFAULT 'legacy' CHECK (auth_provider IN ('legacy','firebase'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_linked_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS users_firebase_uid_uidx ON users (firebase_uid) WHERE firebase_uid IS NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Down Migration
DROP INDEX IF EXISTS users_firebase_uid_uidx;
ALTER TABLE users DROP COLUMN IF EXISTS firebase_linked_at, DROP COLUMN IF EXISTS auth_provider, DROP COLUMN IF EXISTS firebase_uid;
