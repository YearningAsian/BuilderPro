-- BuilderPro seed data for Supabase
-- Run this in the Supabase SQL editor after migrations

-- Vendors
INSERT INTO vendors (id, name, phone, email, address, notes) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'ABC Lumber Supply', '555-100-1001', 'orders@abclumber.com', '100 Mill Rd, Portland OR', NULL),
  ('a1000000-0000-0000-0000-000000000002', 'Pacific Concrete Co.', '555-100-1002', 'sales@pacificconcrete.com', '200 Industrial Blvd, Portland OR', NULL),
  ('a1000000-0000-0000-0000-000000000003', 'SteelMax Distributors', '555-100-1003', 'info@steelmax.com', '300 Commerce Dr, Portland OR', NULL),
  ('a1000000-0000-0000-0000-000000000004', 'National Plumbing Wholesale', '555-100-1004', 'orders@npwholesale.com', '400 Supply Ave, Portland OR', NULL),
  ('a1000000-0000-0000-0000-000000000005', 'BrightWire Electrical', '555-100-1005', 'sales@brightwire.com', '500 Electric Way, Portland OR', NULL)
ON CONFLICT (id) DO NOTHING;

-- Materials
INSERT INTO materials (id, name, category, unit_type, unit_cost, sku, default_vendor_id, default_waste_pct, is_taxable) VALUES
  ('b1000000-0000-0000-0000-000000000001', '2×4 Stud 8ft SPF',       'Lumber',    'piece',       5.48,  'LBR-2x4-8',    'a1000000-0000-0000-0000-000000000001', 10.0, true),
  ('b1000000-0000-0000-0000-000000000002', '2×6 Stud 8ft SPF',       'Lumber',    'piece',       8.27,  'LBR-2x6-8',    'a1000000-0000-0000-0000-000000000001', 10.0, true),
  ('b1000000-0000-0000-0000-000000000003', '4×8 Plywood ½" CDX',     'Lumber',    'sheet',      42.99,  'LBR-PLY-CDX-12','a1000000-0000-0000-0000-000000000001', 8.0, true),
  ('b1000000-0000-0000-0000-000000000004', '4×8 OSB 7/16"',          'Lumber',    'sheet',      32.50,  'LBR-OSB-716',  'a1000000-0000-0000-0000-000000000001', 8.0, true),
  ('b1000000-0000-0000-0000-000000000005', 'Ready-Mix Concrete 4000 PSI','Concrete','cubic yard',145.00,'CON-RM-4000',  'a1000000-0000-0000-0000-000000000002', 5.0, true),
  ('b1000000-0000-0000-0000-000000000006', 'Rebar #4 (½") 20ft',     'Concrete',  'piece',      12.75,  'CON-RB4-20',   'a1000000-0000-0000-0000-000000000003', 5.0, true),
  ('b1000000-0000-0000-0000-000000000007', 'Steel Beam W8×31',       'Steel',     'linear foot', 38.50, 'STL-W8x31',    'a1000000-0000-0000-0000-000000000003', 3.0, true),
  ('b1000000-0000-0000-0000-000000000008', 'Simpson Strong-Tie A34', 'Hardware',  'piece',       1.65,  'HDW-SS-A34',   'a1000000-0000-0000-0000-000000000003', 2.0, true),
  ('b1000000-0000-0000-0000-000000000009', '¾" PEX Tubing 100ft',    'Plumbing',  'roll',        67.00, 'PLM-PEX34-100','a1000000-0000-0000-0000-000000000004', 5.0, true),
  ('b1000000-0000-0000-0000-000000000010', 'Copper Pipe ¾" Type L 10ft','Plumbing','piece',      32.40, 'PLM-CU34-L10', 'a1000000-0000-0000-0000-000000000004', 5.0, true),
  ('b1000000-0000-0000-0000-000000000011', 'Romex 12/2 NM-B 250ft',  'Electrical','roll',        89.99, 'ELC-NM122-250','a1000000-0000-0000-0000-000000000005', 8.0, true),
  ('b1000000-0000-0000-0000-000000000012', 'LED Recessed Can 6" IC-Rated','Electrical','piece',  24.50, 'ELC-LED6-IC',  'a1000000-0000-0000-0000-000000000005', 0.0, true),
  ('b1000000-0000-0000-0000-000000000013', 'R-19 Kraft Batt Insulation 15"','Insulation','sqft', 0.72, 'INS-R19-15',   NULL,                                    10.0, true),
  ('b1000000-0000-0000-0000-000000000014', '½" Drywall 4×8',         'Drywall',   'sheet',      14.48, 'DRY-GWB-12',   NULL,                                    12.0, true),
  ('b1000000-0000-0000-0000-000000000015', 'Joint Compound 5-Gallon', 'Drywall',   'bucket',     22.99, 'DRY-JC-5G',    NULL,                                    5.0,  true)
ON CONFLICT (id) DO NOTHING;

-- Customers
INSERT INTO customers (id, name, phone, email, address) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'Riverside Developments LLC', '555-200-0001', 'contact@riversidedev.com', '1234 River Rd, Portland OR'),
  ('c1000000-0000-0000-0000-000000000002', 'Summit Group',               '555-200-0002', 'info@summitgroup.com',     '5678 Summit Ave, Portland OR'),
  ('c1000000-0000-0000-0000-000000000003', 'Coastal Properties Inc',     '555-200-0003', 'hello@coastalprop.com',    '9012 Beach Blvd, Portland OR')
ON CONFLICT (id) DO NOTHING;
