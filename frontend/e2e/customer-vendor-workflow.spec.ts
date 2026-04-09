import { expect, test, type Route } from "@playwright/test";

const sessionPayload = {
  email: "owner@example.com",
  role: "admin",
  accessToken: "e2e-token",
  tokenType: "bearer",
  workspaceId: "00000000-0000-0000-0000-000000000001",
  workspaceName: "E2E Workspace",
};

function baseCustomer(overrides?: Record<string, unknown>) {
  return {
    id: "21111111-1111-1111-1111-111111111111",
    workspace_id: "00000000-0000-0000-0000-000000000001",
    name: "Acme Homeowner",
    email: "owner@acme.test",
    phone: "555-0101",
    address: "123 Cedar Ave",
    notes: "Prefers email updates.",
    created_at: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseVendor(overrides?: Record<string, unknown>) {
  return {
    id: "31111111-1111-1111-1111-111111111111",
    workspace_id: "00000000-0000-0000-0000-000000000001",
    name: "Summit Supply",
    email: "sales@summit.test",
    phone: "555-0202",
    address: "45 Industrial Way",
    notes: "Call ahead for will-call pickups.",
    created_at: "2026-04-01T00:00:00.000Z",
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

test("customers page supports create and detail workflows via backend endpoints", async ({ page }) => {
  const customers = [baseCustomer()];
  const projects = [
    {
      id: "41111111-1111-1111-1111-111111111111",
      workspace_id: "00000000-0000-0000-0000-000000000001",
      name: "Kitchen Refresh",
      customer_id: customers[0].id,
      status: "active",
      default_tax_pct: 8.25,
      default_waste_pct: 10,
      created_by: null,
      created_at: "2026-04-05T00:00:00.000Z",
      updated_at: "2026-04-08T00:00:00.000Z",
      items: [],
    },
  ];

  await page.route("**/api/customers**", async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(customers),
      });
      return;
    }

    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Record<string, string | null>;
      expect(body.name).toBe("North Ridge");
      expect(body.email).toBe("ops@northridge.test");
      expect(body.phone).toBe("555-1111");

      const created = baseCustomer({
        id: "22222222-2222-2222-2222-222222222222",
        name: body.name,
        email: body.email,
        phone: body.phone,
        address: body.address,
        notes: body.notes,
      });
      customers.push(created);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(created),
      });
      return;
    }

    await route.fallback();
  });

  await page.route("**/api/vendors", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.route("**/api/materials", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.route("**/api/projects", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(projects),
    });
  });

  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();

  await page.getByRole("button", { name: "Add customer" }).click();
  await page.locator('label:has-text("Customer name") input').fill("North Ridge");
  await page.locator('label:has-text("Email") input').fill("ops@northridge.test");
  await page.locator('label:has-text("Phone") input').fill("555-1111");
  await page.locator('label:has-text("Address") input').fill("90 Hill St");
  await page.locator('label:has-text("Notes") textarea').fill("Prefers text reminders.");
  await page.getByRole("button", { name: "Create customer" }).click();

  await expect(page.getByText("Customer created successfully.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "North Ridge details" })).toBeVisible();
  await expect(page.getByText("Prefers text reminders.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "North Ridge" })).toBeVisible();

  await page.getByRole("button", { name: "View" }).first().click();
  await expect(page.getByRole("heading", { name: "Acme Homeowner details" })).toBeVisible();
  await expect(page.getByText("Kitchen Refresh")).toBeVisible();

  await page.getByRole("link", { name: "Acme Homeowner" }).first().click();
  await expect(page).toHaveURL(/\/customers\/21111111-1111-1111-1111-111111111111$/);
  await expect(page.getByRole("heading", { name: "Acme Homeowner" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Kitchen Refresh" })).toBeVisible();
});

test("vendors page supports detail, update, and delete workflows via backend endpoints", async ({ page }) => {
  const vendors = [baseVendor()];
  const materials = [
    {
      id: "51111111-1111-1111-1111-111111111111",
      workspace_id: "00000000-0000-0000-0000-000000000001",
      name: "3/4 Plywood",
      category: "Sheet Goods",
      unit_type: "sheet",
      unit_cost: 48.5,
      sku: "PLY-34",
      default_vendor_id: vendors[0].id,
      size_dims: null,
      notes: null,
      is_taxable: true,
      default_waste_pct: 5,
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z",
    },
  ];

  await page.route("**/api/vendors**", async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(vendors),
      });
      return;
    }

    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as Record<string, string | null>;
      expect(body.name).toBe("Summit Supply West");

      vendors[0] = {
        ...vendors[0],
        name: String(body.name),
        email: body.email,
        phone: body.phone,
        address: body.address,
        notes: body.notes,
      };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(vendors[0]),
      });
      return;
    }

    if (route.request().method() === "DELETE") {
      vendors.splice(0, 1);
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    await route.fallback();
  });

  await page.route("**/api/materials", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(materials),
    });
  });

  await page.route("**/api/customers", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.route("**/api/projects", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  page.on("dialog", (dialog) => {
    void dialog.accept();
  });

  await page.goto("/vendors");
  await expect(page.getByRole("heading", { name: "Vendors" })).toBeVisible();

  await page.getByRole("button", { name: "View" }).click();
  await expect(page.getByRole("heading", { name: "Summit Supply details" })).toBeVisible();
  await expect(page.getByText("3/4 Plywood")).toBeVisible();

  await page.getByRole("link", { name: "Summit Supply" }).first().click();
  await expect(page).toHaveURL(/\/vendors\/31111111-1111-1111-1111-111111111111$/);
  await expect(page.getByRole("heading", { name: "Summit Supply" })).toBeVisible();
  await expect(page.getByText("$48.50/sheet")).toBeVisible();

  await page.getByRole("button", { name: "Edit vendor" }).click();
  await page.locator('label:has-text("Vendor name") input').fill("Summit Supply West");
  await page.getByRole("button", { name: "Save vendor" }).click();

  await expect(page.getByText("Vendor updated successfully.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Summit Supply West details" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Summit Supply West" })).toBeVisible();

  await page.getByRole("button", { name: "Delete" }).first().click();
  await expect(page.getByText("Summit Supply West was removed.")).toBeVisible();
  await expect(page.getByText("No vendors found yet.")).toBeVisible();
});
