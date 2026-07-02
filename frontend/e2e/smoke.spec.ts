import { expect, test } from "@playwright/test";

test("home page renders the shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("navigation")).toContainText("Tinkerer Lab");
  await expect(page.getByTestId("login-link")).toBeVisible();
});

test("login link redirects to Google", async ({ request }) => {
  const response = await request.get("/api/auth/login", {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(307);
  expect(response.headers()["location"]).toContain("accounts.google.com");
});

test("unknown page shows the 404 view", async ({ page }) => {
  const response = await page.goto("/definitely-not-a-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByTestId("not-found")).toBeVisible();
});

test("backend health is reachable through nginx", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  expect(await response.json()).toEqual({ status: "ok" });
});
