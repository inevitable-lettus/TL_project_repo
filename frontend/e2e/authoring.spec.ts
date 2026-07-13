import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { PNG_BYTES, testLogin, type TestUser } from "./helpers";

// Phase 6 journeys: create → write → embed → publish, oversize rejection,
// instant visibility toggle, profile edit. Requires the composed stack in
// test mode and MAX_FILE_SIZE well under 11 MB (local .env uses 10 MB).

const suffix = Date.now();

let author: TestUser;
let authorContext: BrowserContext;

test.beforeAll(async ({ browser }) => {
  authorContext = await browser.newContext();
  author = await testLogin(
    authorContext.request,
    `author-${suffix}@uni.edu`,
    `Author ${suffix}`,
  );
});

test.afterAll(async () => {
  await authorContext.close();
});

async function createViaDashboard(page: Page, title: string): Promise<string> {
  await page.goto("/dashboard");
  await page.getByLabel("Project title").fill(title);
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(/\/dashboard\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}

test("create, write, embed media, publish — then anonymous can read it", async ({
  page,
}) => {
  const authorPage = await authorContext.newPage();
  const title = `Marble Machine ${suffix}`;
  const projectId = await createViaDashboard(authorPage, title);

  await authorPage.getByTestId("editor-content").click();
  await authorPage.keyboard.type("Built from scrap plywood.");
  await authorPage.getByTestId("media-file-input").setInputFiles({
    name: "photo.png",
    mimeType: "image/png",
    buffer: PNG_BYTES,
  });
  await expect(
    authorPage.getByTestId("editor-media").locator("img"),
  ).toBeVisible();

  await authorPage.getByTestId("save-project").click();
  await expect(authorPage.getByTestId("save-status")).toHaveText("SAVED");

  // The fresh embed is offered as a cover immediately. Picking it also
  // generates and uploads a downscaled thumb copy.
  await authorPage
    .getByTestId("cover-picker")
    .locator("button")
    .first()
    .click();
  await expect(authorPage.getByText("COVER", { exact: true })).toBeVisible();

  const detail = await (
    await authorContext.request.get(`/api/projects/${projectId}`)
  ).json();
  expect(detail.cover_thumb_file_id).toBeTruthy();
  expect(detail.cover_thumb_file_id).not.toBe(detail.cover_file_id);

  await authorPage.goto("/dashboard");
  const row = authorPage.getByRole("listitem").filter({ hasText: title });
  await row.getByRole("button", { name: "Make public" }).click();
  await expect(row.getByText("public", { exact: true })).toBeVisible();
  await authorPage.close();

  await page.goto(`/projects/${projectId}`);
  await expect(page.getByText("Built from scrap plywood.")).toBeVisible();
  await expect(page.locator("figure img")).toBeVisible();

  // Cards serve the thumb file, not the full-size cover.
  await page.goto("/projects");
  const cardImg = page
    .getByTestId("showcase-grid")
    .locator(`a[href="/projects/${projectId}"] img`);
  await expect(cardImg).toHaveAttribute(
    "src",
    new RegExp(detail.cover_thumb_file_id),
  );
});

test("oversize upload shows the plain limit message", async () => {
  const authorPage = await authorContext.newPage();
  await createViaDashboard(authorPage, `Oversize Test ${suffix}`);

  await authorPage.getByTestId("attachment-file-input").setInputFiles({
    name: "huge.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(11 * 1024 * 1024),
  });
  await expect(authorPage.getByTestId("upload-error")).toContainText("limit");
  await authorPage.close();
});

test("visibility toggle takes effect immediately", async ({ browser }) => {
  const authorPage = await authorContext.newPage();
  const title = `Toggle Test ${suffix}`;
  const projectId = await createViaDashboard(authorPage, title);
  await authorPage.goto("/dashboard");

  const anon = await browser.newContext();
  const row = authorPage.getByRole("listitem").filter({ hasText: title });

  expect((await anon.request.get(`/api/projects/${projectId}`)).status()).toBe(
    404,
  );

  await row.getByRole("button", { name: "Make public" }).click();
  await expect(row.getByText("public", { exact: true })).toBeVisible();
  expect((await anon.request.get(`/api/projects/${projectId}`)).status()).toBe(
    200,
  );

  await row.getByRole("button", { name: "Make private" }).click();
  await expect(row.getByText("private", { exact: true })).toBeVisible();
  expect((await anon.request.get(`/api/projects/${projectId}`)).status()).toBe(
    404,
  );

  await anon.close();
  await authorPage.close();
});

test("profile edit and avatar persist", async () => {
  const authorPage = await authorContext.newPage();
  await authorPage.goto("/settings");

  await authorPage.getByLabel("Program").fill("Mechatronics");
  await authorPage.getByLabel("Enrollment year").fill("2023");
  await authorPage.getByLabel("About you").fill("I melt things.");
  await authorPage.getByTestId("save-settings").click();
  await expect(authorPage.getByTestId("settings-status")).toHaveText("SAVED");

  await authorPage.getByTestId("avatar-file-input").setInputFiles({
    name: "face.png",
    mimeType: "image/png",
    buffer: PNG_BYTES,
  });
  await expect(authorPage.getByTestId("avatar-preview")).toBeVisible();

  await authorPage.goto(`/users/${author.id}`);
  await expect(authorPage.getByText("I melt things.")).toBeVisible();
  await expect(authorPage.getByText("Mechatronics")).toBeVisible();
  await expect(authorPage.getByText("CLASS_OF_2023")).toBeVisible();
  await expect(authorPage.locator("img[alt]").first()).toBeVisible();
  await authorPage.close();
});
