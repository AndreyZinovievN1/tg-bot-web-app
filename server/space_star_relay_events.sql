-- Manual migration in the PostgreSQL used by iSpaceRobot. Not executed automatically.
BEGIN;
CREATE TABLE IF NOT EXISTS space_star_relay_events (
  id BIGSERIAL PRIMARY KEY,
  bot_id BIGINT NOT NULL,
  event_kind TEXT NOT NULL CHECK (event_kind IN ('successful_payment','refunded_payment')),
  charge_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(bot_id,event_kind,charge_id)
);
CREATE INDEX IF NOT EXISTS space_star_relay_pending ON space_star_relay_events(bot_id,next_attempt_at,id)
  WHERE delivered_at IS NULL;
COMMIT;
