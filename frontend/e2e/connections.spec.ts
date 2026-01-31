import { test, expect } from "@playwright/test";

test.describe("Connections Page", () => {
  test("shows connections page with title", async ({ page }) => {
    await page.goto("/connections");
    await expect(page.getByText("Database Connections")).toBeVisible();
  });

  test("shows add connection button", async ({ page }) => {
    await page.goto("/connections");
    await expect(page.getByRole("link", { name: /add connection/i })).toBeVisible();
  });

  test("navigates to new connection form", async ({ page }) => {
    await page.goto("/connections");
    await page.getByRole("link", { name: /add connection/i }).click();
    await expect(page).toHaveURL(/\/connections\/new/);
    await expect(page.getByText("New Connection")).toBeVisible();
  });

  test("connection form has all required fields", async ({ page }) => {
    await page.goto("/connections/new");
    await expect(page.getByText("Connection Name")).toBeVisible();
    await expect(page.getByText("Database Type")).toBeVisible();
    await expect(page.getByText("Host")).toBeVisible();
    await expect(page.getByText("Port")).toBeVisible();
    await expect(page.getByText("Database Name")).toBeVisible();
    await expect(page.getByText("Username")).toBeVisible();
    await expect(page.getByText("Password")).toBeVisible();
  });

  test("database type buttons switch and update port", async ({ page }) => {
    await page.goto("/connections/new");

    // Default is PostgreSQL (5432)
    const portInput = page.locator('input[type="number"][min="1"]');
    await expect(portInput).toHaveValue("5432");

    // Click MySQL
    await page.getByRole("button", { name: "MySQL" }).click();
    await expect(portInput).toHaveValue("3306");

    // Click SQL Server
    await page.getByRole("button", { name: "SQL Server" }).click();
    await expect(portInput).toHaveValue("1433");
  });

  test("cancel button returns to connections list", async ({ page }) => {
    await page.goto("/connections/new");
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page).toHaveURL(/\/connections/);
  });
});
