import { expect, test, type BrowserContext } from "@playwright/test";
import {
  createProject,
  patchProject,
  PNG_BYTES,
  testLogin,
  uploadFile,
  type TestUser,
} from "./helpers";

// Phase 5 journeys. Requires the composed stack in test mode
// (ENVIRONMENT=test + AUTH_TEST_MODE=1) so /auth/test-login is open.

const suffix = Date.now();
const publicTitle = `Public Widget ${suffix}`;
const secondTitle = `Second Widget ${suffix}`;
const privateTitle = `Secret Widget ${suffix}`;
const attachmentName = `notes-${suffix}.txt`;
const attachmentBody = `attachment payload ${suffix}`;

let owner: TestUser;
let ownerContext: BrowserContext;
let publicId: string;
let privateId: string;

test.beforeAll(async ({ browser }) => {
  ownerContext = await browser.newContext();
  const request = ownerContext.request;
  owner = await testLogin(
    request,
    `owner-${suffix}@uni.edu`,
    `Owner ${suffix}`,
  );

  publicId = await createProject(request, publicTitle, "A very public widget");
  const coverId = await uploadFile(request, publicId, {
    filename: "cover.png",
    mimeType: "image/png",
    data: PNG_BYTES,
    kind: "media",
  });
  const inlineId = await uploadFile(request, publicId, {
    filename: "inline.png",
    mimeType: "image/png",
    data: PNG_BYTES,
    kind: "media",
  });
  await uploadFile(request, publicId, {
    filename: attachmentName,
    mimeType: "text/plain",
    data: Buffer.from(attachmentBody),
    kind: "attachment",
  });
  await patchProject(request, publicId, {
    is_public: true,
    cover_file_id: coverId,
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "The write-up body." }],
        },
        { type: "media", attrs: { fileId: inlineId } },
      ],
    },
  });

  const secondId = await createProject(request, secondTitle);
  const secondCover = await uploadFile(request, secondId, {
    filename: "cover2.png",
    mimeType: "image/png",
    data: PNG_BYTES,
    kind: "media",
  });
  await patchProject(request, secondId, {
    is_public: true,
    cover_file_id: secondCover,
  });

  privateId = await createProject(request, privateTitle, "hidden");
});

test.afterAll(async () => {
  await ownerContext.close();
});

test("anonymous showcase lists public projects only", async ({ page }) => {
  await page.goto("/projects");
  await expect(page.getByText(publicTitle)).toBeVisible();
  await expect(page.getByText(privateTitle)).toHaveCount(0);
});

test("private project URL 404s for anonymous visitors", async ({ page }) => {
  const response = await page.goto(`/projects/${privateId}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByTestId("not-found")).toBeVisible();
});

test("owner sees their private project with a private badge", async () => {
  const page = await ownerContext.newPage();
  await page.goto(`/projects/${privateId}`);
  await expect(page.getByTestId("project-article")).toContainText(privateTitle);
  await expect(page.getByText("private", { exact: true })).toBeVisible();
  await page.close();
});

test("project page renders the write-up with inline media", async ({
  page,
}) => {
  await page.goto(`/projects/${publicId}`);
  await expect(page.getByText("The write-up body.")).toBeVisible();
  const inline = page.locator("figure img");
  await expect(inline).toBeVisible();
  expect(await inline.getAttribute("src")).toContain("/tinkerer-lab/");
});

test("download re-mints a working presigned link", async ({ page }) => {
  await page.goto(`/projects/${publicId}`);
  const row = page.getByRole("listitem").filter({ hasText: attachmentName });
  const popupPromise = page.waitForEvent("popup");
  await row.getByRole("button", { name: "Download" }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(popup.url()).toContain("/tinkerer-lab/");
  const fetched = await page.request.get(popup.url());
  expect(fetched.ok()).toBeTruthy();
  expect(await fetched.text()).toBe(attachmentBody);
  await popup.close();
});

test("landing slider advances automatically", async ({ page }) => {
  await page.goto("/");
  const active = page.getByTestId("slider-active");
  await expect(active).toBeVisible();
  const first = await active.getAttribute("href");
  await expect
    .poll(async () => active.getAttribute("href"), { timeout: 8000 })
    .not.toBe(first);
});

test("profile shows public projects to strangers, private to the owner", async ({
  page,
}) => {
  await page.goto(`/users/${owner.id}`);
  await expect(page.getByText(publicTitle)).toBeVisible();
  await expect(page.getByText(privateTitle)).toHaveCount(0);

  const ownerPage = await ownerContext.newPage();
  await ownerPage.goto(`/users/${owner.id}`);
  await expect(ownerPage.getByText(privateTitle)).toBeVisible();
  await ownerPage.close();
});
