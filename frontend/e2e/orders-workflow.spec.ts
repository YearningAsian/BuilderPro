import { expect, test, type Route } from "@playwright/test";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const vendorId = "31111111-1111-1111-1111-111111111111";
const customerId = "21111111-1111-1111-1111-111111111111";
const materialId = "41111111-1111-1111-1111-111111111111";
const projectId = "51111111-1111-1111-1111-111111111111";
const itemId = "61111111-1111-1111-1111-111111111111";

const sessionPayload = {
  email: "owner@example.com",
  role: "admin",
  accessToken: "e2e-token",
  tokenType: "bearer",
  workspaceId,
  workspaceName: "E2E Workspace",
};

function buildProjectItem(overrides?: Record<string, unknown>) {
  return {
    id: itemId,
    project_id: projectId,
    material_id: materialId,
    quantity: 12,
    unit_type: "ea",
    unit_cost: 8.5,
    waste_pct: 5,
    total_qty: 12.6,
    line_subtotal: 107.1,
    order_status: "draft",
    po_number: null,
    purchase_notes: null,
    expected_delivery_at: null,
    carrier: null,
    tracking_number: null,
    tracking_url: null,
    notes: "Cut to fit pantry framing.",
    ordered_at: null,
    received_at: null,
    created_at: "2026-04-01T00:00:00.000Z",
    updated_at: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

test.beforeEach(async ({ page, context }) => {
  const nowIso = new Date().toISOString();
  const activeSession = {
    ...sessionPayload,
    signedInAt: nowIso,
    lastActiveAt: nowIso,
  };

  await context.addCookies([
    {
      name: "builderpro_auth",
      value: "1",
      url: "http://127.0.0.1:3010",
      sameSite: "Lax",
    },
    {
      name: "builderpro_role",
      value: activeSession.role,
      url: "http://127.0.0.1:3010",
      sameSite: "Lax",
    },
  ]);

  await page.addInitScript((payload) => {
    window.localStorage.setItem("builderpro_session", JSON.stringify(payload));
  }, activeSession);
});

test("orders page creates a purchase order from ready vendor lines", async ({ page }) => {
  let projectItem = buildProjectItem();
  const purchaseOrders: Array<Record<string, unknown>> = [];

  await page.route("**/api/auth/workspaces**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          workspace_id: workspaceId,
          workspace_name: "E2E Workspace",
          role: "admin",
          is_active: true,
        },
      ]),
    });
  });

  await page.route("**/api/vendors**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: vendorId,
          workspace_id: workspaceId,
          name: "Summit Supply",
          email: "orders@summit.test",
          phone: "555-0202",
          address: "45 Industrial Way",
          notes: null,
          created_at: "2026-04-01T00:00:00.000Z",
        },
      ]),
    });
  });

  await page.route("**/api/materials**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: materialId,
          workspace_id: workspaceId,
          name: "2x4 Lumber",
          category: "Lumber",
          unit_type: "ea",
          unit_cost: 8.5,
          sku: "LMB-24",
          default_vendor_id: vendorId,
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

  await page.route("**/api/customers**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: customerId,
          workspace_id: workspaceId,
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

  await page.route("**/api/projects**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: projectId,
          workspace_id: workspaceId,
          name: "Kitchen Remodel",
          customer_id: customerId,
          status: "active",
          default_tax_pct: 8,
          default_waste_pct: 5,
          created_by: null,
          created_at: "2026-04-01T00:00:00.000Z",
          updated_at: "2026-04-01T00:00:00.000Z",
          items: [projectItem],
        },
      ]),
    });
  });

  await page.route("**/api/orders/purchase-orders**", async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(purchaseOrders),
      });
      return;
    }

    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as {
        vendor_id: string;
        po_number: string;
        item_ids: string[];
        purchase_notes: string | null;
        tracking_url: string | null;
      };

      expect(body.vendor_id).toBe(vendorId);
      expect(body.po_number).toBe("PO-2026-200");
      expect(body.item_ids).toEqual([itemId]);
      expect(body.purchase_notes).toBe("Deliver to rear entrance");
      expect(body.tracking_url).toBe("https://tracking.test/po-2026-200");

      projectItem = buildProjectItem({
        order_status: "ordered",
        po_number: body.po_number,
        purchase_notes: body.purchase_notes,
        tracking_url: body.tracking_url,
        tracking_number: "1Z-PO-2026-200",
        carrier: "UPS Ground",
        expected_delivery_at: "2026-04-18T15:30:00.000Z",
        ordered_at: "2026-04-10T09:00:00.000Z",
        updated_at: "2026-04-10T09:00:00.000Z",
      });

      const createdOrder = {
        po_number: body.po_number,
        vendor_id: vendorId,
        vendor_name: "Summit Supply",
        vendor_email: "orders@summit.test",
        vendor_phone: "555-0202",
        order_status: "ordered",
        line_count: 1,
        total_amount: 107.1,
        expected_delivery_at: "2026-04-18T15:30:00.000Z",
        carrier: "UPS Ground",
        tracking_number: "1Z-PO-2026-200",
        tracking_url: body.tracking_url,
        ordered_at: "2026-04-10T09:00:00.000Z",
        received_at: null,
        updated_at: "2026-04-10T09:00:00.000Z",
        lines: [
          {
            id: itemId,
            project_id: projectId,
            project_name: "Kitchen Remodel",
            material_id: materialId,
            material_name: "2x4 Lumber",
            quantity: 12,
            total_qty: 12.6,
            unit_type: "ea",
            unit_cost: 8.5,
            line_subtotal: 107.1,
            order_status: "ordered",
            notes: "Cut to fit pantry framing.",
            purchase_notes: body.purchase_notes,
          },
        ],
      };

      purchaseOrders.splice(0, purchaseOrders.length, createdOrder);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(createdOrder),
      });
      return;
    }

    await route.fallback();
  });

  await page.goto("/orders");
  await expect(page.getByRole("heading", { name: "Purchase Orders" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Summit Supply" })).toBeVisible();
  await expect(page.getByText("1 ready line(s) across 1 project(s)")).toBeVisible();

  await page.getByLabel("PO number").fill("PO-2026-200");
  await page.getByLabel("Tracking URL").fill("https://tracking.test/po-2026-200");
  await page.getByLabel("PO notes").fill("Deliver to rear entrance");
  await page.getByRole("button", { name: "Create purchase order" }).click();

  await expect(page.getByText("Created purchase order PO-2026-200 for Summit Supply.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "PO-2026-200" })).toBeVisible();
  await expect(page.getByText("Summit Supply · 1 line(s)")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Kitchen Remodel" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "2x4 Lumber" })).toBeVisible();
});