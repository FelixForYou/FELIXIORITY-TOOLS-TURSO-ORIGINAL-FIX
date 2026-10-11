import { test, expect, type Page } from "@playwright/test";
import {
  snapshot,
  session as fixtureSession,
  user,
  server,
} from "../tests/fixtures";
// Fixtures exist only in this browser suite. Production has no mock mode.
async function prepare(page: Page, connected = true) {
  const s = fixtureSession();
  const data = snapshot();
  data.users = Array.from({ length: 205 }, (_, i) => user(i + 1, i === 0));
  data.servers = Array.from({ length: 205 }, (_, i) => server(i + 1, i + 1));
  data.totals = { users: 205, servers: 205, nodes: 1 };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/session")
      return route.fulfill({
        status: connected ? 200 : 401,
        json: connected
          ? {
              domain: s.domain,
              csrf: s.csrf,
              expiresAt: s.expiresAt,
              settings: s.settings,
              hasRuntime: false,
              protectedIds: [],
              bulkDelete: true,
              apiVersion: "1.x",
            }
          : { error: { message: "Sesi berakhir." } },
      });
    if (path === "/api/connect") {
      const key = route.request().postDataJSON().key;
      if (key.includes("invalid"))
        return route.fulfill({
          status: 403,
          json: { error: { message: "API key tidak valid atau dicabut." } },
        });
      connected = true;
      return route.fulfill({ json: { ok: true } });
    }
    if (path === "/api/snapshot") return route.fulfill({ json: data });
    if (path === "/api/runtime") return route.fulfill({ json: {} });
    if (path === "/api/logs") return route.fulfill({ json: [] });
    return route.fulfill({
      status: 404,
      json: { error: { message: "Unexpected test endpoint" } },
    });
  });
}
async function nav(page: Page, label: string) {
  if (await page.getByRole("button", { name: "Buka navigasi" }).isVisible())
    await page.getByRole("button", { name: "Buka navigasi" }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: label, exact: true })
    .click();
}
test("connect hanya memiliki dua input dan tidak bocor ke localStorage", async ({
  page,
}) => {
  await prepare(page, false);
  await page.goto("/");
  await expect(page.locator("form input")).toHaveCount(2);
  await page.getByLabel("Panel Domain").fill("https://panel.example.com");
  await page.getByLabel("Application API Key").fill("ptla_" + "a".repeat(32));
  await page.getByRole("button", { name: "Connect Panel" }).click();
  await expect(
    page.getByRole("heading", { name: "Panel Overview." }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
test("invalid key menampilkan kegagalan", async ({ page }) => {
  await prepare(page, false);
  await page.goto("/");
  await page.getByLabel("Panel Domain").fill("https://panel.example.com");
  await page
    .getByLabel("Application API Key")
    .fill("ptla_invalid" + "a".repeat(24));
  await page.getByRole("button", { name: "Connect Panel" }).click();
  await expect(page.getByRole("alert")).toContainText("API key tidak valid");
});
test("total >100, pencarian, select all filtered, dan admin terlindungi", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/");
  await expect(
    page
      .locator(".stat")
      .filter({ hasText: "Total Servers" })
      .locator("strong"),
  ).toHaveText("205");
  await nav(page, "Servers");
  await page.getByLabel("Cari dalam daftar").fill("Server 205");
  await expect(
    page
      .locator(".table-card b:visible")
      .filter({ hasText: "Server 205" })
      .first(),
  ).toBeVisible();
  await page.getByText("Pilih semua hasil").click();
  await expect(page.locator(".selection-bar")).toContainText("1 dipilih");
  await nav(page, "Administrators");
  await expect(page.getByText("1 administrator terlindungi.")).toBeVisible();
  await expect(page.locator("tbody input[type=checkbox]")).toHaveCount(0);
});
test("runtime tanpa PTLC menonaktifkan cleaner dan layout muat layar", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/");
  await nav(page, "Offline Cleaner");
  await expect(
    page.getByRole("button", { name: "Scan Servers", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Status Tidak Tersedia.", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
