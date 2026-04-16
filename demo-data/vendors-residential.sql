-- ================================================================
-- BuilderPro Vendor Seed — General Residential Construction
--
-- HOW TO USE:
--   1. Open your Supabase project dashboard
--   2. Go to SQL Editor
--   3. Find your workspace_id:
--        Table Editor → workspace_members → copy the workspace_id
--   4. Replace every 'YOUR_WORKSPACE_ID' below with that UUID
--   5. Run the script
-- ================================================================

INSERT INTO vendors (id, workspace_id, name, phone, email, address, notes, created_at)
VALUES
  (
    gen_random_uuid(),
    'YOUR_WORKSPACE_ID'::uuid,
    'Regional Lumber Co.',
    '(555) 201-4400',
    'orders@regionallumber.com',
    '1200 Industrial Blvd, Suite A',
    'Primary lumber, structural panels, and deck materials. Delivery Mon–Fri. Min order $500 for free delivery.',
    now()
  ),
  (
    gen_random_uuid(),
    'YOUR_WORKSPACE_ID'::uuid,
    'Southwest Concrete Supply',
    '(555) 348-7700',
    'dispatch@swconcrete.com',
    '4800 Quarry Road',
    'Ready-mix concrete, block, brick, masonry, and forming supplies. 24hr advance notice for ready-mix.',
    now()
  ),
  (
    gen_random_uuid(),
    'YOUR_WORKSPACE_ID'::uuid,
    'National Electrical Wholesale',
    '(555) 512-9300',
    'sales@newholesale.com',
    '2250 Commerce Park Dr',
    'Full-line electrical distributor. Wire, panels, devices, lighting. Contractor accounts available.',
    now()
  ),
  (
    gen_random_uuid(),
    'YOUR_WORKSPACE_ID'::uuid,
    'Plumbing Pro Distributors',
    '(555) 678-2200',
    'orders@plumbingpro.com',
    '900 Trade Center Blvd',
    'Wholesale plumbing supply. PEX, copper, PVC, fixtures, water heaters. Will-call or delivery.',
    now()
  ),
  (
    gen_random_uuid(),
    'YOUR_WORKSPACE_ID'::uuid,
    'Interior Supply Group',
    '(555) 445-8800',
    'info@interiorsupplygrp.com',
    '3300 Building Supply Way',
    'Drywall, insulation, flooring, paint, trim, millwork, metal framing, and interior finishes. Volume discounts available.',
    now()
  ),
  (
    gen_random_uuid(),
    'YOUR_WORKSPACE_ID'::uuid,
    'Roofing Direct',
    '(555) 734-6100',
    'sales@roofingdirect.com',
    '7100 Distribution Ave',
    'Roofing materials specialist. Shingles, underlayment, ice & water shield, metal trim. Job-site delivery.',
    now()
  ),
  (
    gen_random_uuid(),
    'YOUR_WORKSPACE_ID'::uuid,
    'Pro Hardware Supply',
    '(555) 289-5500',
    'orders@prohardwaresupply.com',
    '1850 Contractor Row',
    'Fasteners, connectors, adhesives, saw blades, tool consumables, waterproofing, and HVAC accessories. Open 6AM–6PM weekdays.',
    now()
  ),
  (
    gen_random_uuid(),
    'YOUR_WORKSPACE_ID'::uuid,
    'Window & Door Depot',
    '(555) 391-7700',
    'orders@windowdoordepot.com',
    '5500 Showroom Blvd',
    'Windows, exterior and interior doors, garage doors, and related hardware. Measures and installs available.',
    now()
  ),
  (
    gen_random_uuid(),
    'YOUR_WORKSPACE_ID'::uuid,
    'Cabinet & Millwork Supply',
    '(555) 556-4400',
    'sales@cabinetmillwork.com',
    '2900 Cabinetry Lane',
    'RTA and assembled cabinets, countertops, stairs, rails, and custom millwork. Lead times vary.',
    now()
  )
ON CONFLICT DO NOTHING;
