import { expect, test, type Route } from "@playwright/test";

const sessionPayload = {
  email: "owner@example.com",
  role: "admin",
  accessToken: "e2e-token",
  tokenType: "bearer",
  workspaceId: "00000000-0000-0000-0000-000000000001",
  workspaceName: "E2E Workspace",
};

function baseMaterial(overrides?: Record<string, unknown>) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    workspace_id: "00000000-0000-0000-0000-000000000001",
    name: "Framing Stud",
    category: "Lumber",
    unit_type: "each",
    unit_cost: 6.25,
    sku: "LMB-001",
    default_vendor_id: null,
    size_dims: null,
    notes: null,
    is_taxable: true,
    default_waste_pct: 5,
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

test("materials CSV import uses backend endpoint", async ({ page }) => {
  const materials = [baseMaterial()];

  await page.route("**/api/materials/import/csv", async (route: Route) => {
    expect(route.request().method()).toBe("POST");
    materials.push(
      baseMaterial({
        id: "22222222-2222-2222-2222-222222222222",
        name: "Primer",
        category: "Paint",
        sku: "PNT-100",
        unit_type: "gal",
        unit_cost: 21.5,
      }),
    );

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        created: 1,
        updated: 0,
        skipped: 0,
        errors: [],
      }),
    });
  });

  await page.route("**/api/materials/*/price-history**", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.route("**/api/materials/*/attachments**", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.route("**/api/materials**", async (route: Route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(materials),
    });
  });

  await page.route("**/api/vendors", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.route("**/api/customers", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.route("**/api/projects", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto("/materials");
  await expect(page.getByRole("heading", { name: "Materials Catalog" })).toBeVisible();

  const csvInput = page.locator('input[type="file"][accept=".csv,text/csv"]');
  await csvInput.setInputFiles({
    name: "materials.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("name,unit_type,unit_cost,sku\nPrimer,gal,21.5,PNT-100\n", "utf-8"),
  });

  await expect(page.getByText("CSV import complete: 1 created, 0 updated, 0 skipped.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Primer" })).toBeVisible();
});

test("materials details loads price history and uploads attachments", async ({ page }) => {
  const materialId = "11111111-1111-1111-1111-111111111111";
  const attachments = [
    {
      id: "a-1",
      material_id: materialId,
      name: "Initial sheet",
      url: "https://files.example/initial.pdf",
      mime_type: "application/pdf",
      size_bytes: 1000,
      uploaded_at: "2026-04-08T12:00:00.000Z",
      uploaded_by_user_id: null,
    },
  ];

  await page.route(`**/api/materials/${materialId}/price-history**`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "h-1",
          material_id: materialId,
          previous_unit_cost: 5.5,
          new_unit_cost: 6.25,
          source: "manual",
          changed_by_user_id: null,
          changed_at: "2026-04-08T10:00:00.000Z",
        },
      ]),
    });
  });

  await page.route(`**/api/materials/${materialId}/attachments/upload`, async (route: Route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headerValue("content-type")).toContain("multipart/form-data");

    const created = {
      id: "a-2",
      material_id: materialId,
      name: "Uploaded datasheet",
      url: "https://files.example/uploaded.pdf",
      mime_type: "application/pdf",
      size_bytes: 2048,
      uploaded_at: "2026-04-08T13:00:00.000Z",
      uploaded_by_user_id: null,
    };
    attachments.unshift(created);

    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(created) });
  });

  await page.route(`**/api/materials/${materialId}/attachments/*`, async (route: Route) => {
    if (route.request().method() === "DELETE") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    await route.fallback();
  });

  await page.route(`**/api/materials/${materialId}/attachments**`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(attachments) });
  });

  await page.route("**/api/materials**", async (route: Route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([baseMaterial({ id: materialId })]),
    });
  });

  await page.route("**/api/vendors", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
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

  await page.goto("/materials");
  await page.getByRole("button", { name: "View" }).click();

  await expect(page.getByRole("heading", { name: "Price history" })).toBeVisible();
  await expect(page.getByText("manual")).toBeVisible();

  await page.getByPlaceholder("Optional display name").fill("Uploaded datasheet");
  await page.getByLabel("Attachment file").setInputFiles({
    name: "datasheet.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-test", "utf-8"),
  });
  await page.getByRole("button", { name: "Upload attachment" }).click();

  await expect(page.getByRole("link", { name: "Uploaded datasheet" })).toBeVisible();

  await page.getByRole("button", { name: "Remove" }).first().click();
  await expect(page.getByText("Attachment removed.")).toBeVisible();
});
