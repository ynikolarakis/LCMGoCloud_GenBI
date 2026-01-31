import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("loads the app and shows navbar", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("GenBI Platform")).toBeVisible();
    await expect(page.getByRole("link", { name: /connections/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /chat/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /dashboard/i })).toBeVisible();
  });

  test("root redirects to connections", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Database Connections")).toBeVisible();
  });

  test("navigates to chat page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /chat/i }).click();
    await expect(page).toHaveURL(/\/chat/);
    await expect(page.getByText("Connection:")).toBeVisible();
  });

  test("navigates to dashboard page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /dashboard/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("chat page shows empty state when no connection selected", async ({ page }) => {
    await page.goto("/chat");
    await expect(
      page.getByText(/ask a question about your data/i),
    ).toBeVisible();
  });

  test("dashboard page shows empty state", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText(/no pinned charts/i)).toBeVisible();
  });
});
