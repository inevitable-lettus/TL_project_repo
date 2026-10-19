import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createLoan, createProject, inDays, testLogin } from "./helpers";

// The admin Loans tab (borrowing v2, issue #31). staff@uni.edu is in
// STAFF_EMAILS for the test stack. Every loan here carries `suffix` in its
// item name, so searching for it shows only this run's loans.

const suffix = Date.now();
const projectTitle = `Rover ${suffix}`;
const drill = `Drill ${suffix}`;
const scope = `Scope ${suffix}`;
const pla = `PLA ${suffix}`;

let staff: BrowserContext;
let studentName: string;

test.beforeAll(async ({ browser }) => {
  staff = await browser.newContext();
  await testLogin(staff.request, "staff@uni.edu", "Staff Member");

  const student = await browser.newContext();
  studentName = `Loan Student ${suffix}`;
  await testLogin(student.request, `loans-${suffix}@uni.edu`, studentName);
  const projectId = await createProject(student.request, projectTitle);
  await createLoan(student.request, {
    type: "equipment",
    item_name: drill,
    quantity: 2,
    project_id: projectId,
    due_date: inDays(5),
    photos: 2,
  });
  await createLoan(student.request, {
    type: "equipment",
    item_name: scope,
    due_date: inDays(3),
  });
  await createLoan(student.request, {
    type: "material",
    item_name: pla,
    quantity: 250,
    unit: "g",
  });
  await student.close();
});

test.afterAll(async () => {
  await staff.close();
});

async function openLoansTab(page: Page) {
  await page.goto("/admin");
  await page.getByTestId("tab-loans").click();
  await page.getByLabel("Search loans").fill(String(suffix));
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByTestId("loan-total")).toHaveText("3");
}

const row = (page: Page, item: string) =>
  page.getByTestId("admin-loan").filter({ hasText: item });

test("students get no Loans tab and a 403 from the loans API", async ({
  browser,
}) => {
  const student = await browser.newContext();
  await testLogin(student.request, `nosy-${suffix}@uni.edu`, "Nosy Student");
  const page = await student.newPage();
  const response = await page.goto("/admin");
  expect(response?.status()).toBe(404);
  await expect(page.getByTestId("tab-loans")).toHaveCount(0);
  for (const path of ["/api/admin/loans", "/api/admin/loans/export.csv"]) {
    expect((await student.request.get(path)).status(), path).toBe(403);
  }
  await student.close();
});

test("a student's loan shows with its photos and project", async () => {
  const page = await staff.newPage();
  await openLoansTab(page);

  const loan = row(page, drill);
  await expect(loan).toContainText(`${drill} × 2 pcs`);
  await expect(loan).toContainText(studentName);
  await expect(loan).toContainText(`For ${projectTitle}`);
  await expect(loan).toContainText("equipment");
  await expect(loan).toContainText("out");

  await loan.getByRole("button").first().click();
  const detail = loan.getByTestId("loan-detail");
  await expect(detail.getByRole("img", { name: /^Borrow photo/ })).toHaveCount(
    2,
  );
  await expect(detail.getByText(`About ${drill}`)).toBeVisible();
  await expect(
    detail.getByRole("link", { name: projectTitle }),
  ).toHaveAttribute("href", /\/projects\//);
  await expect(detail.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(detail.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await page.close();
});

test("type, status and date filters narrow the list", async () => {
  const page = await staff.newPage();
  await openLoansTab(page);

  await page.getByLabel("Type").selectOption("material");
  await expect(page.getByTestId("loan-total")).toHaveText("1");
  await expect(row(page, pla)).toContainText("used");

  await page.getByLabel("Type").selectOption("");
  await page.getByLabel("Status").selectOption("out");
  await expect(page.getByTestId("loan-total")).toHaveText("2");

  // Nothing of this run is past due, so overdue shows none of it, and
  // every row it shows (across all loans) is overdue.
  await page.getByLabel("Status").selectOption("overdue");
  await expect(page.getByTestId("loan-total")).toHaveText("0");
  await page.getByLabel("Search loans").fill("");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByTestId("admin-loans")).not.toContainText(drill);
  const rows = page.getByTestId("admin-loan");
  await expect(rows.filter({ hasText: /\boverdue\b/ })).toHaveCount(
    await rows.count(),
  );

  await page.getByLabel("Status").selectOption("");
  await page.getByLabel("Search loans").fill(String(suffix));
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByLabel("Borrowed from").fill(inDays(1));
  await expect(page.getByTestId("loan-total")).toHaveText("0");
  await page.getByLabel("Borrowed from").fill(inDays(-1));
  await page.getByLabel("Borrowed to").fill(inDays(1));
  await expect(page.getByTestId("loan-total")).toHaveText("3");
  await page.close();
});

test("export link carries the active filters", async () => {
  const page = await staff.newPage();
  await openLoansTab(page);
  await page.getByLabel("Type").selectOption("material");
  await expect(page.getByTestId("loan-total")).toHaveText("1");

  const href = await page.getByTestId("loan-export").getAttribute("href");
  const url = new URL(href!, "http://x");
  expect(url.pathname).toBe("/api/admin/loans/export.csv");
  expect(url.searchParams.get("type")).toBe("material");
  expect(url.searchParams.get("q")).toBe(String(suffix));

  const csv = await (await staff.request.get(href!)).text();
  expect(csv).toContain(pla);
  expect(csv).not.toContain(drill);
  await page.close();
});

test("staff mark a loan returned without a photo", async () => {
  const page = await staff.newPage();
  await openLoansTab(page);

  const loan = row(page, scope);
  await loan.getByRole("button").first().click();
  await loan.getByRole("button", { name: "Mark returned" }).click();
  await loan.getByLabel("Note (optional)").fill("Dropped at the desk");
  await loan.getByRole("button", { name: "Confirm returned" }).click();

  await expect(loan).toContainText("returned");
  await expect(loan.getByTestId("return-info")).toContainText(
    "by Staff Member: Dropped at the desk",
  );
  await expect(loan.getByRole("button", { name: "Mark returned" })).toHaveCount(
    0,
  );
  await page.close();
});

test("at 360px the Loans tab has no horizontal scroll", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 360, height: 740 },
  });
  await testLogin(context.request, "staff@uni.edu", "Staff Member");
  const page = await context.newPage();
  await openLoansTab(page);
  await row(page, drill).getByRole("button").first().click();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await context.close();
});
