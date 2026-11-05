-- Manual migration only. Durable idempotency for internal batch rewards.
BEGIN;
CREATE TABLE IF NOT EXISTS mini_app_case_batches (
  chat_id bigint NOT NULL,
  request_id uuid NOT NULL,
  case_type text NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 2 AND 5),
  results jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, request_id)
);
COMMIT;
-- Run with the API database role, or grant SELECT, INSERT, UPDATE to that role.
-- Do not delete successful rows: retries must retain their original results.
