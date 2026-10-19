import { expect, test, type Browser, type Page } from "@playwright/test";
import { createProject, PNG_BYTES, testLogin } from "./helpers";

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

async function signedInPage(
  browser: Browser,
  who: string,
  viewport?: { width: number; height: number },
) {
  const context = await browser.newContext(viewport ? { viewport } : {});
  const user = await testLogin(
    context.request,
    `${who}-${suffix}@uni.edu`,
    who,
  );
  const page = await context.newPage();
  return { context, page, user };
}

async function addPhotos(page: Page, count: number) {
  for (let i = 0; i < count; i += 1) {
    await page.getByTestId("borrow-photo-input").setInputFiles(photo);
  }
  await expect(page.getByTestId("photo-count")).toContainText(`${count} of`);
}

async function fillEquipment(page: Page, item: string) {
  await page.getByLabel("Item").fill(item);
  await page.getByLabel("Description").fill("Badge build");
  await page.getByLabel("Return by").fill(inDays(3));
}

test("signed-out /borrow sends the visitor to log in", async ({ request }) => {
  const response = await request.get("/borrow", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers()["location"]).toContain("/api/auth/login");
});

test("signed-out photo link sends the visitor to log in, not a 404", async ({
  request,
}) => {
  const response = await request.get(
    "/loans/photo/00000000-0000-4000-8000-000000000000",
    { maxRedirects: 0 },
  );
  expect(response.status()).toBe(307);
  expect(response.headers()["location"]).toContain("/api/auth/login");
});

test("equipment with 2 photos and a project lands in ON_LOAN", async ({
  browser,
}) => {
  const { context, page } = await signedInPage(browser, "loaner");
  const projectTitle = `Line follower ${suffix}`;
  await createProject(context.request, projectTitle);
  await page.goto("/borrow");

  await addPhotos(page, 2);
  await fillEquipment(page, `Soldering iron ${suffix}`);
  await page.getByLabel("Quantity").fill("2");
  await page.getByLabel("Project").selectOption({ label: projectTitle });
  await page.getByRole("button", { name: "Borrow", exact: true }).click();

  await expect(page.getByTestId("borrow-confirmation")).toBeVisible();
  const loan = page.getByTestId("open-loan").filter({
    hasText: `Soldering iron ${suffix}`,
  });
  await expect(loan).toContainText("× 2 pcs");
  await expect(loan).toContainText(`For ${projectTitle}`);
  await expect(loan.getByRole("link", { name: /^Photo \d$/ })).toHaveCount(2);

  const photoUrl = await loan
    .getByRole("link", { name: "Photo 1" })
    .getAttribute("href");
  const redirect = await context.request.get(photoUrl!, { maxRedirects: 0 });
  expect(redirect.status()).toBe(307);
  await context.close();
});

test("material hides the return date and lands in USED.LOG", async ({
  browser,
}) => {
  const { context, page } = await signedInPage(browser, "maker");
  await page.goto("/borrow");

  await page.getByRole("button", { name: "Material" }).click();
  await expect(page.getByLabel("Return by")).toHaveCount(0);
  await addPhotos(page, 1);
  await page.getByLabel("Item").fill(`PLA filament ${suffix}`);
  await page.getByLabel("Quantity").fill("250");
  await page.getByLabel("Unit").selectOption("g");
  await page.getByLabel("Description").fill("Printing a bracket");
  await page.getByRole("button", { name: "Log material" }).click();

  const used = page.getByTestId("used-loans");
  await expect(used).toContainText(`PLA filament ${suffix} × 250 g`);
  await expect(used).toContainText("used");
  await expect(page.getByTestId("open-loan")).toHaveCount(0);
  await context.close();
});

test("return with a photo moves the loan to RETURNED", async ({ browser }) => {
  const { context, page, user } = await signedInPage(browser, "returner");
  await page.goto("/borrow");

  await addPhotos(page, 1);
  await fillEquipment(page, `Multimeter ${suffix}`);
  await page.getByRole("button", { name: "Borrow", exact: true }).click();
  const loan = page.getByTestId("open-loan").filter({
    hasText: `Multimeter ${suffix}`,
  });
  await expect(loan).toBeVisible();

  await loan.getByRole("button", { name: "Return" }).click();
  await loan.getByTestId("return-photo-input").setInputFiles(photo);
  await loan.getByLabel("Condition note (optional)").fill("Probe tip worn");
  await loan.getByRole("button", { name: "Confirm return" }).click();

  await expect(loan).toHaveCount(0);
  const returned = page.getByTestId("returned-loans");
  await expect(returned).toContainText("Returned (1)");
  await expect(returned).not.toHaveAttribute("open", "");
  await returned.locator("summary").click();
  await expect(returned).toContainText("Probe tip worn");
  await expect(
    returned.getByRole("link", { name: "Return photo" }),
  ).toBeVisible();

  const mine = await (await context.request.get("/api/loans/mine")).json();
  const saved = mine.find(
    (entry: { item_name: string }) =>
      entry.item_name === `Multimeter ${suffix}`,
  );
  expect(saved.status).toBe("returned");
  expect(saved.returned_by_id).toBe(user.id);
  await context.close();
});

test("a dropped submit is retried as one loan with the same id", async ({
  browser,
}) => {
  const { context, page } = await signedInPage(browser, "retry");
  await page.goto("/borrow");

  const loanIds: string[] = [];
  let uploads = 0;
  await page.route("**/api/loans/photo", (route) => {
    uploads += 1;
    return route.continue();
  });
  await page.route("**/api/loans", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    loanIds.push(route.request().postDataJSON().id);
    return loanIds.length === 1 ? route.abort() : route.continue();
  });

  await addPhotos(page, 2);
  await fillEquipment(page, `Retry item ${suffix}`);
  const submit = page.getByRole("button", { name: "Borrow", exact: true });
  await submit.click();
  await expect(page.getByTestId("upload-error")).toBeVisible();
  await expect(page.getByLabel("Item")).toHaveValue(`Retry item ${suffix}`);

  await submit.dblclick();
  await expect(page.getByTestId("borrow-confirmation")).toBeVisible();
  expect(new Set(loanIds).size).toBe(1);
  expect(uploads).toBe(2); // the ready photos are reused, not re-uploaded

  const mine = await context.request.get("/api/loans/mine");
  const items = (await mine.json()).filter(
    (loan: { item_name: string }) => loan.item_name === `Retry item ${suffix}`,
  );
  expect(items).toHaveLength(1);
  await expect(page.getByTestId("open-loan")).toHaveCount(1);
  await context.close();
});

test("an edit after a failed submit is sent as a new loan", async ({
  browser,
}) => {
  const { context, page } = await signedInPage(browser, "editor");
  await page.goto("/borrow");

  // The first submit lands on the server; only its reply is lost.
  const loanIds: string[] = [];
  await page.route("**/api/loans", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    loanIds.push(route.request().postDataJSON().id);
    if (loanIds.length > 1) return route.continue();
    await route.fetch();
    return route.abort();
  });

  await addPhotos(page, 1);
  await fillEquipment(page, `First name ${suffix}`);
  const submit = page.getByRole("button", { name: "Borrow", exact: true });
  await submit.click();
  await expect(page.getByTestId("upload-error")).toBeVisible();

  await page.getByLabel("Item").fill(`Edited name ${suffix}`);
  await submit.click();
  await expect(page.getByTestId("borrow-confirmation")).toContainText(
    `Edited name ${suffix}`,
  );
  expect(new Set(loanIds).size).toBe(2);
  await context.close();
});

test("submit is blocked without a photo and Add photo stops at the limit", async ({
  browser,
}) => {
  const { context, page } = await signedInPage(browser, "nophoto");
  await page.goto("/borrow");
  const rules = await (await context.request.get("/api/loans/rules")).json();

  await fillEquipment(page, "No photo yet");
  const submit = page.getByRole("button", { name: "Borrow", exact: true });
  await expect(submit).toBeDisabled();

  await addPhotos(page, rules.max_photos);
  await expect(submit).toBeEnabled();
  await expect(page.getByRole("button", { name: "Add photo" })).toBeDisabled();

  await page.getByRole("button", { name: "Remove photo 1" }).click();
  await expect(page.getByRole("button", { name: "Add photo" })).toBeEnabled();
  await context.close();
});

test("at 360px: no horizontal scroll and 44px tap targets", async ({
  browser,
}) => {
  const { context, page } = await signedInPage(browser, "phone", {
    width: 360,
    height: 740,
  });
  await page.goto("/borrow");
  await addPhotos(page, 2);
  await fillEquipment(page, "Long loan");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  for (const label of [
    "Item",
    "Quantity",
    "Unit",
    "Project",
    "Description",
    "Return by",
  ]) {
    const box = await page.getByLabel(label).boundingBox();
    expect(box!.height, label).toBeGreaterThanOrEqual(44);
  }
  for (const name of ["Equipment", "Material", "Add photo", "Remove photo 1"]) {
    const box = await page.getByRole("button", { name }).boundingBox();
    expect(box!.height, name).toBeGreaterThanOrEqual(44);
  }
  await context.close();
});

test("an API error shows its text and keeps the input", async ({ browser }) => {
  const { context, page } = await signedInPage(browser, "far");
  await page.goto("/borrow");
  // The date input's max blocks this in the UI; post straight past it.
  await page.route("**/api/loans", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = { ...route.request().postDataJSON(), due_date: inDays(400) };
    return route.continue({ postData: JSON.stringify(body) });
  });

  await addPhotos(page, 1);
  await fillEquipment(page, "Too far out");
  await page.getByRole("button", { name: "Borrow", exact: true }).click();

  await expect(page.getByTestId("upload-error")).toContainText("at most");
  await expect(page.getByLabel("Item")).toHaveValue("Too far out");
  await context.close();
});

test("a return whose response was lost is retried as success, not a 409", async ({
  browser,
}) => {
  const { context, page } = await signedInPage(browser, "lost");
  await page.goto("/borrow");
  await addPhotos(page, 1);
  await fillEquipment(page, `Lost reply ${suffix}`);
  await page.getByRole("button", { name: "Borrow", exact: true }).click();
  const loan = page.getByTestId("open-loan").filter({
    hasText: `Lost reply ${suffix}`,
  });
  await expect(loan).toBeVisible();

  // The server records the return; only its reply never reaches the page.
  await page.route("**/api/loans/*/return", async (route) => {
    await route.fetch();
    await route.abort();
  });
  await loan.getByRole("button", { name: "Return" }).click();
  await loan.getByTestId("return-photo-input").setInputFiles(photo);
  const confirm = loan.getByRole("button", { name: "Confirm return" });
  await confirm.click();
  await expect(loan.getByTestId("upload-error")).toBeVisible();

  await page.unroute("**/api/loans/*/return");
  await confirm.click(); // server answers 409; the UI treats it as done
  await expect(loan).toHaveCount(0);
  await expect(page.getByTestId("returned-loans")).toContainText(
    "Returned (1)",
  );
  await context.close();
});
