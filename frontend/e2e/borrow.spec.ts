import { expect, test } from "@playwright/test";
import { PNG_BYTES, testLogin } from "./helpers";

// The Sheet is not reachable from CI, so the default run only checks the
// page shell. The full borrow → return journey needs the fake Sheet
// (backend/tests/fake_sheet.py) wired in via LOANS_SCRIPT_URL; run it with
// E2E_LOANS=1.

const suffix = Date.now();
function inDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

const photo = { name: "item.png", mimeType: "image/png", buffer: PNG_BYTES };

test("signed-out /borrow sends the visitor to log in", async ({ request }) => {
  const response = await request.get("/borrow", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers()["location"]).toContain("/api/auth/login");
});

test("signed-in /borrow shows the log window", async ({ browser }) => {
  const context = await browser.newContext();
  await testLogin(context.request, `borrower-${suffix}@uni.edu`, "Borrower");
  const page = await context.newPage();
  await page.goto("/borrow");
  await expect(page.getByText("BORROW.LOG")).toBeVisible();
  // Form when borrowing is configured, the friendly state when it is not.
  await expect(
    page
      .getByRole("button", { name: "Take photo" })
      .or(page.getByTestId("borrow-not-configured")),
  ).toBeVisible();
  await context.close();
});

test.describe("borrow and return (needs the fake Sheet)", () => {
  test.skip(!process.env.E2E_LOANS, "set E2E_LOANS=1 with the fake Sheet up");

  test("borrow, view the photo, return", async ({ browser }) => {
    const context = await browser.newContext();
    await testLogin(context.request, `loaner-${suffix}@uni.edu`, "Loaner");
    const page = await context.newPage();
    await page.goto("/borrow");

    const dueDate = inDays(3);

    await page.getByTestId("borrow-photo-input").setInputFiles(photo);
    await expect(page.getByAltText("Photo to upload")).toBeVisible();
    await page.getByLabel("Item").fill(`Soldering iron ${suffix}`);
    await page.getByLabel("Quantity").fill("2");
    await page.getByLabel("Return by").fill(dueDate);
    await page.getByLabel("Reason").fill("Badge build");
    await page.getByRole("button", { name: "Borrow", exact: true }).click();

    await expect(page.getByTestId("borrow-confirmation")).toBeVisible();
    const loan = page.getByTestId("open-loan").filter({
      hasText: `Soldering iron ${suffix}`,
    });
    await expect(loan).toContainText("× 2");

    const photoUrl = await loan
      .getByRole("link", { name: "View photo" })
      .getAttribute("href");
    const redirect = await context.request.get(photoUrl!, {
      maxRedirects: 0,
    });
    expect(redirect.status()).toBe(307);

    await loan.getByRole("button", { name: "Return" }).click();
    await loan.getByTestId("return-photo-input").setInputFiles(photo);
    await loan.getByLabel("Condition note (optional)").fill("Tip is worn");
    await loan.getByRole("button", { name: "Confirm return" }).click();

    await expect(loan).toHaveCount(0);
    const returned = page.getByTestId("returned-loans");
    await expect(returned).toContainText("Returned (1)");
    await returned.locator("summary").click();
    await expect(returned).toContainText("Tip is worn");
    await context.close();
  });

  test("a dropped request is retried with the same loan_id", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    await testLogin(context.request, `retry-${suffix}@uni.edu`, "Retry");
    const page = await context.newPage();
    await page.goto("/borrow");

    const loanIds: string[] = [];
    let uploads = 0;
    await page.route("**/api/loans/photo", (route) => {
      uploads += 1;
      return route.continue();
    });
    await page.route("**/api/loans", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      loanIds.push(route.request().postDataJSON().loan_id);
      return loanIds.length === 1 ? route.abort() : route.continue();
    });

    await page.getByTestId("borrow-photo-input").setInputFiles(photo);
    await page.getByLabel("Item").fill(`Retry item ${suffix}`);
    await page.getByLabel("Return by").fill(inDays(2));
    await page.getByLabel("Reason").fill("Network drop");
    const submit = page.getByRole("button", { name: "Borrow", exact: true });
    await submit.click();
    await expect(page.getByTestId("upload-error")).toBeVisible();
    await expect(page.getByLabel("Item")).toHaveValue(`Retry item ${suffix}`);

    await submit.click();
    await expect(page.getByTestId("borrow-confirmation")).toBeVisible();
    expect(loanIds).toHaveLength(2);
    expect(loanIds[1]).toBe(loanIds[0]);
    expect(uploads).toBe(1); // the ready photo is reused, not re-uploaded

    const mine = await context.request.get("/api/loans/mine");
    const items = (await mine.json()).filter(
      (loan: { item_name: string }) =>
        loan.item_name === `Retry item ${suffix}`,
    );
    expect(items).toHaveLength(1);
    await context.close();
  });

  test("an API error shows its text and keeps the input", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 360, height: 740 },
    });
    await testLogin(context.request, `far-${suffix}@uni.edu`, "Far");
    const page = await context.newPage();
    await page.goto("/borrow");

    await page.getByTestId("borrow-photo-input").setInputFiles(photo);
    await page.getByLabel("Item").fill("Long loan");
    await page.getByLabel("Return by").fill(inDays(400));
    await page.getByLabel("Reason").fill("Too far out");
    await page.getByRole("button", { name: "Borrow", exact: true }).click();

    await expect(page.getByTestId("upload-error")).toContainText("at most");
    await expect(page.getByLabel("Item")).toHaveValue("Long loan");
    await expect(page.getByLabel("Reason")).toHaveValue("Too far out");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    await context.close();
  });
});
