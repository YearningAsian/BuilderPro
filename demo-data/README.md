BuilderPro demo data files

---

## Residential Seed Data (use these)

### Step 1 — Seed vendors (SQL)

File: `vendors-residential.sql`

1. Open your Supabase project dashboard → SQL Editor
2. Find your workspace_id: Table Editor → workspace_members → copy workspace_id
3. Open `vendors-residential.sql`, replace every `YOUR_WORKSPACE_ID` with your UUID
4. Run the script

This creates 7 vendors:
- Regional Lumber Co.
- Southwest Concrete Supply
- National Electrical Wholesale
- Plumbing Pro Distributors
- Interior Supply Group
- Roofing Direct
- Pro Hardware Supply

### Step 2 — Import materials (CSV)

File: `materials-residential.csv`

**Vendors must be seeded first** — the CSV references vendor names to link materials.

1. Sign in to the app
2. Go to Materials
3. Click Import CSV (or the upload button)
4. Select `materials-residential.csv`
5. Review the import summary (should show ~115 created, 0 errors)

This creates ~115 materials across 13 categories:
Concrete & Masonry, Framing Lumber, Structural Panels, Roofing,
Insulation, Drywall & Plaster, Flooring, Plumbing, Electrical,
Hardware & Fasteners, Paint & Finish, HVAC

---

## CSV format reference

Required columns: `name`, `unit_type`, `unit_cost`

Optional columns:
- `category` — groups materials in the catalog
- `sku` — used for deduplication on re-import (updates matched by SKU)
- `default_waste_pct` — waste percentage applied in estimates
- `is_taxable` — true/false
- `size_dims` — dimension string (e.g. "4x8", "2x4x8")
- `notes` — internal notes visible in material detail
- `default_vendor_name` — must match an existing vendor name exactly

Notes:
- Re-importing the same CSV is safe — existing SKUs are updated, not duplicated
- If a vendor name doesn't match, that field is skipped (material still imports)
- `materials-demo-create.csv` and `materials-demo-update.csv` are small test files