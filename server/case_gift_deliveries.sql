-- Manual only; apply AFTER case_batch_openings.sql. Never run at API startup.
BEGIN;
CREATE TABLE IF NOT EXISTS mini_app_case_deliveries (
  id uuid PRIMARY KEY,
  chat_id bigint NOT NULL,
  request_id uuid NOT NULL,
  reward_index integer NOT NULL CHECK (reward_index BETWEEN 0 AND 4),
  opening_id bigint UNIQUE REFERENCES case_openings(id),
  input jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'review')),
  attempts integer NOT NULL DEFAULT 0,
  attempt_id uuid,
  available_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  error_code text,
  last_error text,
  audit jsonb NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (chat_id, request_id, reward_index),
  FOREIGN KEY (chat_id, request_id) REFERENCES mini_app_case_batches(chat_id, request_id)
);
CREATE INDEX IF NOT EXISTS mini_app_case_deliveries_ready
  ON mini_app_case_deliveries (available_at) WHERE status = 'queued';
COMMIT;
-- Run as the API DB role or grant SELECT, INSERT, UPDATE on this table to it.
-- Do NOT truncate this journal, reset sending/review to queued, or delete batches.
-- Queued = never attempted or explicitly rejected. Review = outcome unknown:
-- do not resend. Owner must verify delivery with the provider before confirming.
