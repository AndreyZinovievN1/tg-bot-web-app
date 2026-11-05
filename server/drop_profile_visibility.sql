-- Manual only. Do not include in startup schema initialization.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS drop_profile_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS drop_profile_notice_at timestamptz;
-- Existing users remain anonymous until informed; never reset an existing refusal.
COMMIT;
