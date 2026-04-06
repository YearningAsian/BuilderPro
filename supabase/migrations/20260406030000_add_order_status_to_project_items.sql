-- Add persistent order lifecycle tracking for workspace purchasing.

BEGIN;

ALTER TABLE public.project_items
  ADD COLUMN IF NOT EXISTS order_status text;

UPDATE public.project_items AS pi
SET order_status = CASE
  WHEN p.status = 'closed' THEN 'received'
  ELSE 'draft'
END
FROM public.projects AS p
WHERE pi.project_id = p.id
  AND pi.order_status IS NULL;

UPDATE public.project_items
SET order_status = 'draft'
WHERE order_status IS NULL;

ALTER TABLE public.project_items
  ALTER COLUMN order_status SET DEFAULT 'draft';

ALTER TABLE public.project_items
  ALTER COLUMN order_status SET NOT NULL;

ALTER TABLE public.project_items
  DROP CONSTRAINT IF EXISTS ck_project_items_order_status;

ALTER TABLE public.project_items
  ADD CONSTRAINT ck_project_items_order_status
  CHECK (order_status IN ('draft', 'ordered', 'received', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_project_items_order_status
  ON public.project_items(order_status);

COMMIT;
