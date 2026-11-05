-- Manual only, after space_stars_tribute.sql. Safe to run again; no balance changes.
BEGIN;
ALTER TABLE space_star_orders ADD COLUMN IF NOT EXISTS tribute_amount_minor BIGINT;
ALTER TABLE space_star_orders ADD COLUMN IF NOT EXISTS tribute_currency TEXT;

UPDATE space_star_orders SET tribute_amount_minor=amount_rub_kopecks, tribute_currency='RUB'
WHERE tribute_purchase_id IS NOT NULL AND amount_rub_kopecks IS NOT NULL
  AND tribute_amount_minor IS NULL AND tribute_currency IS NULL;

ALTER TABLE space_star_orders DROP CONSTRAINT IF EXISTS space_star_order_currency;
ALTER TABLE space_star_orders ADD CONSTRAINT space_star_order_currency CHECK (
  (tribute_purchase_id IS NULL AND tribute_product_id IS NULL AND amount_rub_kopecks IS NULL
    AND tribute_amount_minor IS NULL AND tribute_currency IS NULL AND amount_xtr IS NOT NULL)
  OR (tribute_purchase_id IS NOT NULL AND tribute_product_id IS NOT NULL AND amount_xtr IS NULL AND (
    -- Keep old RUB writers valid during a rolling update.
    (tribute_amount_minor IS NULL AND tribute_currency IS NULL AND amount_rub_kopecks IS NOT NULL AND amount_rub_kopecks>0)
    OR (tribute_amount_minor IS NOT NULL AND tribute_amount_minor>0 AND tribute_currency IS NOT NULL AND (
      (tribute_currency='RUB' AND amount_rub_kopecks IS NOT NULL AND amount_rub_kopecks=tribute_amount_minor)
      OR (tribute_currency='USD' AND amount_rub_kopecks IS NULL)
    ))
  ))
);
COMMIT;
