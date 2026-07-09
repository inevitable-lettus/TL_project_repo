import { expect, test, type BrowserContext } from "@playwright/test";
import {
  createProject,
  patchProject,
  PNG_BYTES,
  testLogin,
  uploadFile,
} from "./helpers";

// Phase 7 journeys. staff@uni.edu is in STAFF_EMAILS for the test stack.

const suffix = Date.now();
const featuredTitle = `Curated Build ${suffix}`;

let staffContext: BrowserContext;

test.beforeAll(async ({ browser }) => {
  staffContext = await browser.newContext();
  await testLogin(staffContext.request, "staff@uni.edu", "Staff Member");
});

test.afterAll(async () => {
  await staffContext.close();
});

test("students get a 404 from /admin", async ({ browser }) => {
  const student = await browser.newContext();
  await testLogin(
    student.request,
    `plain-student-${suffix}@uni.edu`,
    "Plain Student",
  );
  const page = await student.newPage();
  const response = await page.goto("/admin");
  expect(response?.status()).toBe(404);
  await expect(page.getByTestId("not-found")).toBeVisible();
  await student.close();
});

test("featuring a project puts it on the landing page", async ({ page }) => {
  const request = staffContext.request;
  const projectId = await createProject(request, featuredTitle);
  const coverId = await uploadFile(request, projectId, {
    filename: "cover.png",
    mimeType: "image/png",
    data: PNG_BYTES,
    kind: "media",
  });
  await patchProject(request, projectId, {
    is_public: true,
    cover_file_id: coverId,
  });

  const staffPage = await staffContext.newPage();
  await staffPage.goto("/admin");
  await staffPage.getByTestId("feature-select").selectOption(projectId);
  await staffPage.getByTestId("feature-add").click();
  await expect(
    staffPage.getByTestId("featured-list").getByText(featuredTitle),
  ).toBeVisible();
  await staffPage.close();

  await page.goto("/");
  await expect(
    page.getByTestId("featured-grid").getByText(featuredTitle),
  ).toBeVisible();
});

test("promote and demote take effect immediately", async ({ browser }) => {
  const target = await browser.newContext();
  const targetUser = await testLogin(
    target.request,
    `promotee-${suffix}@uni.edu`,
    `Promotee ${suffix}`,
  );

  expect((await target.request.get("/api/admin/users")).status()).toBe(403);

  const staffPage = await staffContext.newPage();
  await staffPage.goto("/admin");
  await staffPage.getByTestId("tab-people").click();
  await staffPage.getByLabel("Search people").fill(targetUser.email);
  await staffPage.getByRole("button", { name: "Search" }).click();
  const row = staffPage
    .getByTestId("people-list")
    .getByRole("listitem")
    .filter({ hasText: targetUser.email });
  await row.getByRole("button", { name: "Promote" }).click();
  await expect(row.getByText("staff", { exact: true })).toBeVisible();

  expect((await target.request.get("/api/admin/users")).status()).toBe(200);

  await row.getByRole("button", { name: "Demote" }).click();
  await expect(row.getByText("student", { exact: true })).toBeVisible();
  expect((await target.request.get("/api/admin/users")).status()).toBe(403);

  await staffPage.close();
  await target.close();
});

test("moderation can hide any project", async ({ browser }) => {
  const owner = await browser.newContext();
  await testLogin(owner.request, `mod-target-${suffix}@uni.edu`, "Mod Target");
  const title = `Questionable Build ${suffix}`;
  const projectId = await createProject(owner.request, title);
  await patchProject(owner.request, projectId, { is_public: true });
  await owner.close();

  const anon = await browser.newContext();
  expect((await anon.request.get(`/api/projects/${projectId}`)).status()).toBe(
    200,
  );

  const staffPage = await staffContext.newPage();
  await staffPage.goto("/admin");
  await staffPage.getByTestId("tab-moderation").click();
  await staffPage.getByLabel("Search projects").fill(title);
  await staffPage.getByRole("button", { name: "Search" }).click();
  const row = staffPage
    .getByTestId("moderation-list")
    .getByRole("listitem")
    .filter({ hasText: title });
  await row.getByRole("button", { name: "Hide" }).click();
  await expect(row.getByText("private", { exact: true })).toBeVisible();

  expect((await anon.request.get(`/api/projects/${projectId}`)).status()).toBe(
    404,
  );
  await anon.close();
  await staffPage.close();
});
