-- Manual migration. Never run automatically by the application.
BEGIN;
CREATE TABLE IF NOT EXISTS space_star_wallets (
  telegram_user_id BIGINT PRIMARY KEY,
  balance BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS space_star_orders (
  id UUID PRIMARY KEY,
  telegram_user_id BIGINT NOT NULL REFERENCES space_star_wallets(telegram_user_id),
  request_id UUID NOT NULL,
  package_id TEXT NOT NULL,
  units BIGINT NOT NULL CHECK (units > 0),
  amount_xtr INTEGER NOT NULL CHECK (amount_xtr > 0),
  invoice_link TEXT,
  credited_charge TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','refunded','review')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (telegram_user_id, request_id)
);
CREATE TABLE IF NOT EXISTS space_star_payments (
  charge_id TEXT PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES space_star_orders(id),
  refunded BOOLEAN NOT NULL DEFAULT false,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  refunded_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS space_star_ledger (
  id BIGSERIAL PRIMARY KEY,
  telegram_user_id BIGINT NOT NULL REFERENCES space_star_wallets(telegram_user_id),
  order_id UUID NOT NULL REFERENCES space_star_orders(id),
  charge_id TEXT NOT NULL REFERENCES space_star_payments(charge_id),
  kind TEXT NOT NULL CHECK (kind IN ('credit','refund')),
  amount BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (charge_id, kind)
);
CREATE INDEX IF NOT EXISTS space_star_history_user ON space_star_ledger(telegram_user_id, id DESC);
COMMIT;
