import { test, expect } from "@playwright/test";

test.describe("Chat Page", () => {
  test("shows connection selector", async ({ page }) => {
    await page.goto("/chat");
    await expect(page.getByText("Connection:")).toBeVisible();
  });

  test("chat input is disabled when no connection selected", async ({ page }) => {
    await page.goto("/chat");
    const input = page.getByPlaceholder(/ask a question/i);
    await expect(input).toBeDisabled();
  });

  test("ask button is disabled when no connection selected", async ({ page }) => {
    await page.goto("/chat");
    const askBtn = page.getByRole("button", { name: /ask/i });
    await expect(askBtn).toBeDisabled();
  });

  test("shows empty chat message", async ({ page }) => {
    await page.goto("/chat");
    await expect(
      page.getByText(/ask a question about your data/i),
    ).toBeVisible();
  });
});
