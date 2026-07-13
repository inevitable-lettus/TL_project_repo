import { expect, test } from "@playwright/test";
import { testLogin } from "./helpers";

const suffix = Date.now();

test("tool checkout: out, listed, returned", async ({ browser }) => {
  const ctx = await browser.newContext();
  await testLogin(ctx.request, `tools-${suffix}@uni.edu`, `Tools ${suffix}`);
  const page = await ctx.newPage();

  await page.goto("/tools");
  await page.fill("#co-tool", `Torque wrench ${suffix}`);
  await page.getByTestId("submit-checkout").click();

  const row = page
    .getByTestId("open-checkouts")
    .locator("li")
    .filter({ hasText: `Torque wrench ${suffix}` });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Return" }).click();
  await expect(row).toHaveCount(0);
  await expect(page.getByText("RETURNED.LOG")).toBeVisible();
  await ctx.close();
});

test("issue report reaches staff triage and resolves", async ({ browser }) => {
  const reporterCtx = await browser.newContext();
  await testLogin(
    reporterCtx.request,
    `reporter-${suffix}@uni.edu`,
    `Reporter ${suffix}`,
  );
  const page = await reporterCtx.newPage();

  // Entry point from the machines page, machine pre-selected via query.
  await page.goto("/machines");
  await page.getByRole("link", { name: "Report an issue" }).click();
  await page.waitForURL("/report");
  await page.selectOption("#issue-machine", "laser-cutter");
  await page.selectOption("#issue-severity", "high");
  await page.fill("#issue-description", `Lens cracked ${suffix}`);
  await page.getByTestId("submit-issue").click();
  await expect(page.getByText("Report filed")).toBeVisible();

  const staffCtx = await browser.newContext();
  await testLogin(staffCtx.request, "staff@uni.edu", "Staff");
  const admin = await staffCtx.newPage();
  await admin.goto("/admin");
  await admin.getByTestId("tab-issues").click();
  const row = admin
    .getByTestId("issues-list")
    .locator("li")
    .filter({ hasText: `Lens cracked ${suffix}` });
  await expect(row.getByText("high", { exact: true })).toBeVisible();

  await row.getByRole("button", { name: "Resolve" }).click();
  await expect(row).toHaveCount(0);

  await reporterCtx.close();
  await staffCtx.close();
});
