import { expect, test } from "@playwright/test";

const sessionPayload = {
  email: "owner@example.com",
  role: "admin",
  accessToken: "e2e-token",
  tokenType: "bearer",
  workspaceId: "00000000-0000-0000-0000-000000000001",
  workspaceName: "E2E Workspace",
  signedInAt: "2026-04-08T12:00:00.000Z",
};

const projectBase = {
  id: "11111111-1111-1111-1111-111111111111",
  workspace_id: "00000000-0000-0000-0000-000000000001",
  name: "Baseline Project",
  customer_id: "22222222-2222-2222-2222-222222222222",
  status: "active",
  default_tax_pct: 8,
  default_waste_pct: 5,
  created_by: null,
  created_at: "2026-04-01T00:00:00.000Z",
  updated_at: "2026-04-01T00:00:00.000Z",
};

const projectItem = {
  id: "33333333-3333-3333-3333-333333333333",
  project_id: projectBase.id,
  material_id: "44444444-4444-4444-4444-444444444444",
  quantity: 10,
  unit_type: "ea",
  unit_cost: 10,
  waste_pct: 5,
  total_qty: 10.5,
  line_subtotal: 105,
  order_status: "draft",
  po_number: null,
  purchase_notes: null,
  expected_delivery_at: null,
  carrier: null,
  tracking_number: null,
  tracking_url: null,
  notes: null,
  ordered_at: null,
  received_at: null,
  created_at: "2026-04-01T00:00:00.000Z",
  updated_at: "2026-04-01T00:00:00.000Z",
};

test.beforeEach(async ({ page, context }) => {
  await context.addCookies([
    {
      name: "builderpro_auth",
      value: "1",
      url: "http://127.0.0.1:3010",
      sameSite: "Lax",
    },
    {
      name: "builderpro_role",
      value: sessionPayload.role,
      url: "http://127.0.0.1:3010",
      sameSite: "Lax",
    },
  ]);

  await page.addInitScript((payload) => {
    window.localStorage.setItem("builderpro_session", JSON.stringify(payload));
  }, sessionPayload);

  await page.route("**/api/materials", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: projectItem.material_id,
          workspace_id: projectBase.workspace_id,
          name: "2x4 Lumber",
          category: "Lumber",
          unit_type: "ea",
          unit_cost: 10,
          sku: "LMB-001",
          default_vendor_id: null,
          size_dims: null,
          notes: null,
          is_taxable: true,
          default_waste_pct: 5,
          created_at: "2026-04-01T00:00:00.000Z",
          updated_at: "2026-04-01T00:00:00.000Z",
        },
      ]),
    });
  });

  await page.route("**/api/vendors", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.route("**/api/customers", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: projectBase.customer_id,
          workspace_id: projectBase.workspace_id,
          name: "Acme Owner",
          phone: null,
          email: null,
          address: null,
          notes: null,
          created_at: "2026-04-01T00:00:00.000Z",
        },
      ]),
    });
  });

  await page.route("**/api/projects", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          ...projectBase,
          items: [projectItem],
        },
      ]),
    });
  });
});

test("duplicate action posts to duplicate endpoint", async ({ page }) => {
  await page.route("**/api/projects/*/duplicate", async (route) => {
    const body = route.request().postDataJSON() as { name?: string; include_items?: boolean };
    expect(body.include_items).toBe(true);

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        duplicated_items: 1,
        project: {
          ...projectBase,
          id: "55555555-5555-5555-5555-555555555555",
          name: body.name || "Baseline Project (Copy)",
          status: "draft",
          items: [
            {
              ...projectItem,
              id: "66666666-6666-6666-6666-666666666666",
              project_id: "55555555-5555-5555-5555-555555555555",
              order_status: "draft",
            },
          ],
        },
      }),
    });
  });

  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();

  await page.getByPlaceholder("Optional copy name").fill("Duplicate Target");
  await page.getByRole("button", { name: "Duplicate" }).first().click();

  await expect(page).toHaveURL(/\/projects\/55555555-5555-5555-5555-555555555555/);
});

test("estimate export uses markup and opens print document", async ({ page }) => {
  await page.route("**/api/projects/*/estimate-document**", async (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get("markup_pct")).toBe("22");

    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html><body><h1>Project Estimate</h1><p>Markup 22%</p></body></html>",
    });
  });

  await page.goto(`/projects/${projectBase.id}`);
  await expect(page.getByRole("heading", { name: "Markup Tracking" })).toBeVisible();

  await page.locator('input[type="number"]').first().fill("22");

  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Export Estimate / PDF" }).click();
  const popup = await popupPromise;

  await popup.waitForLoadState("domcontentloaded");
  await expect(popup.getByText("Project Estimate")).toBeVisible();
});
