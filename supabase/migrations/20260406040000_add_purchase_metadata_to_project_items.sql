-- Add purchasing metadata fields to project items so orders can track PO details and fulfillment dates.

BEGIN;

ALTER TABLE public.project_items
  ADD COLUMN IF NOT EXISTS po_number text,
  ADD COLUMN IF NOT EXISTS purchase_notes text,
  ADD COLUMN IF NOT EXISTS ordered_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_at timestamptz;

UPDATE public.project_items
SET ordered_at = COALESCE(ordered_at, updated_at, created_at)
WHERE order_status IN ('ordered', 'received')
  AND ordered_at IS NULL;

UPDATE public.project_items
SET received_at = COALESCE(received_at, updated_at, created_at)
WHERE order_status = 'received'
  AND received_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_project_items_po_number
  ON public.project_items(po_number)
  WHERE po_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_items_ordered_at
  ON public.project_items(ordered_at)
  WHERE ordered_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_items_received_at
  ON public.project_items(received_at)
  WHERE received_at IS NOT NULL;

COMMIT;
