BuilderPro demo CSV files

These files match the materials CSV importer used by the app.

Files:
- materials-demo-create.csv: first import file that should create new materials.
- materials-demo-update.csv: second import file that reuses some of the same SKUs to test update behavior.

Required columns:
- name
- unit_type
- unit_cost

Optional columns used here:
- category
- sku
- default_waste_pct
- is_taxable
- size_dims
- notes

Notes:
- Updates are matched by SKU.
- If you include default_vendor_name or vendor_name, that vendor must already exist in the workspace.
- These demo files avoid vendor columns so they should import cleanly into a new workspace.