-- Manual only. Apply after space_stars.sql. No modification to VIP or XTR rows.
BEGIN;
ALTER TABLE space_star_orders ALTER COLUMN amount_xtr DROP NOT NULL;
ALTER TABLE space_star_orders ADD COLUMN IF NOT EXISTS tribute_purchase_id TEXT;
ALTER TABLE space_star_orders ADD COLUMN IF NOT EXISTS tribute_product_id TEXT;
ALTER TABLE space_star_orders ADD COLUMN IF NOT EXISTS amount_rub_kopecks BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS space_star_tribute_purchase ON space_star_orders(tribute_purchase_id)
  WHERE tribute_purchase_id IS NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='space_star_orders'::regclass AND conname='space_star_order_currency') THEN
    ALTER TABLE space_star_orders ADD CONSTRAINT space_star_order_currency CHECK (
      (tribute_purchase_id IS NULL AND tribute_product_id IS NULL AND amount_rub_kopecks IS NULL AND amount_xtr IS NOT NULL)
      OR (tribute_purchase_id IS NOT NULL AND tribute_product_id IS NOT NULL AND amount_rub_kopecks IS NOT NULL AND amount_rub_kopecks>0 AND amount_xtr IS NULL)
    );
  END IF;
END $$;
COMMIT;
