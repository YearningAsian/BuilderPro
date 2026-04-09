-- Add delivery ETA and shipment tracking fields for order workflow completion.
ALTER TABLE project_items
  ADD COLUMN IF NOT EXISTS expected_delivery_at timestamptz,
  ADD COLUMN IF NOT EXISTS carrier text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS tracking_url text;

CREATE INDEX IF NOT EXISTS idx_project_items_expected_delivery_at ON project_items(expected_delivery_at);
CREATE INDEX IF NOT EXISTS idx_project_items_tracking_number ON project_items(tracking_number);
