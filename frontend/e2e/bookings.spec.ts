import { expect, test } from "@playwright/test";
import { testLogin } from "./helpers";

const suffix = Date.now();
// Bookings persist across test runs, so spread runs over the advance window
// and claim the first free slot of that day.
const dayOffset = 1 + (suffix % 25);
const bookDate = new Date(Date.now() + dayOffset * 86400000)
  .toISOString()
  .slice(0, 10);

test("student books a slot, staff approve it, the slot blocks", async ({
  browser,
}) => {
  const studentCtx = await browser.newContext();
  await testLogin(
    studentCtx.request,
    `booker-${suffix}@uni.edu`,
    `Booker ${suffix}`,
  );
  const page = await studentCtx.newPage();

  // Reach the form from the machines directory.
  await page.goto("/machines");
  await page.getByTestId("book-laser-cutter").click();
  await page.waitForURL("/machines/laser-cutter/book");

  await page.fill("#booking-date", bookDate);
  const freeSlot = page
    .getByTestId("slot-grid")
    .locator("button:enabled")
    .first();
  const slotTime = await freeSlot.innerText();
  await freeSlot.click();
  await page.fill("#booking-purpose", "acrylic case for the rover");
  await page.getByTestId("submit-booking").click();
  await expect(page.getByText("Request sent")).toBeVisible();

  // Staff approve from the admin Bookings tab.
  const staffCtx = await browser.newContext();
  await testLogin(staffCtx.request, "staff@uni.edu", "Staff");
  const admin = await staffCtx.newPage();
  await admin.goto("/admin");
  await admin.getByTestId("tab-bookings").click();
  const row = admin
    .getByTestId("bookings-list")
    .locator("li")
    .filter({ hasText: `Booker ${suffix}` });
  await row.getByRole("button", { name: "Approve" }).click();
  // The pending-only filter drops the row once approved; check under "All".
  await expect(row).toHaveCount(0);
  await admin.getByLabel("Filter bookings").selectOption("");
  await expect(row.getByText("approved", { exact: true })).toBeVisible();

  // The approved slot is now disabled on the grid.
  await page.goto("/machines/laser-cutter/book");
  await page.fill("#booking-date", bookDate);
  await expect(page.getByTestId(`slot-${slotTime.trim()}`)).toBeDisabled();

  // And the student sees the decision on their dashboard.
  await page.goto("/dashboard");
  await expect(
    page.getByTestId("my-bookings").getByText("approved", { exact: true }),
  ).toBeVisible();

  await studentCtx.close();
  await staffCtx.close();
});
