-- Apply manually AFTER space_stars.sql. No migration has been executed by Codex.
BEGIN;
CREATE TABLE IF NOT EXISTS space_star_case_purchases (
  telegram_user_id BIGINT NOT NULL REFERENCES space_star_wallets(telegram_user_id),
  request_id UUID NOT NULL,
  case_type TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 5),
  unit_price BIGINT NOT NULL CHECK (unit_price > 0),
  total BIGINT NOT NULL CHECK (total = unit_price * quantity),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (telegram_user_id, request_id)
);
CREATE INDEX IF NOT EXISTS space_star_case_purchases_history ON space_star_case_purchases(telegram_user_id, created_at DESC);
COMMIT;
