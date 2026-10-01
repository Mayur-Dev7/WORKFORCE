-- Up Migration

ALTER TABLE companies
ADD CONSTRAINT companies_name_key UNIQUE (name);

-- Down Migration

ALTER TABLE companies
DROP CONSTRAINT IF EXISTS companies_name_key;
