import { expect, test } from "@playwright/test";

// Machines directory backed by the demo CSV fixture (MACHINES_SHEET_CSV_URL
// points at /machines-demo.csv served by the frontend through nginx).

test("machines directory lists equipment grouped with live status", async ({
  page,
}) => {
  await page.goto("/machines");
  await expect(page.getByTestId("machines-list")).toBeVisible();

  await expect(page.getByText("DIGITAL_FABRICATION/")).toBeVisible();
  await expect(page.getByText("Success Laser Cutter")).toBeVisible();

  await expect(page.getByText("MAINTENANCE")).toBeVisible(); // lathe row
  await expect(page.getByText("OFFLINE")).toBeVisible(); // cut-off saw row
  await expect(page.getByText("TRAINING_REQUIRED").first()).toBeVisible();
});

test("machines link is in the menu bar", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation").getByText("Machines").click();
  await page.waitForURL("/machines");
  await expect(page.getByTestId("machines-list")).toBeVisible();
});
