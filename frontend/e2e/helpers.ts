import { expect, type APIRequestContext } from "@playwright/test";

// Shared setup helpers for journey specs. All go through nginx like a real
// browser: /api for the backend, /tinkerer-lab for presigned MinIO forms.

export type TestUser = { id: string; email: string; name: string };

// 1x1 orange PNG.
export const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export async function testLogin(
  request: APIRequestContext,
  email: string,
  name: string,
): Promise<TestUser> {
  const response = await request.post("/api/auth/test-login", {
    data: { email, name },
  });
  expect(response.ok()).toBeTruthy();
  const user = await response.json();
  return { id: user.id, email, name };
}

export async function createProject(
  request: APIRequestContext,
  title: string,
  description?: string,
): Promise<string> {
  const response = await request.post("/api/projects", {
    data: { title, description },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).id;
}

export async function uploadFile(
  request: APIRequestContext,
  projectId: string,
  options: {
    filename: string;
    mimeType: string;
    data: Buffer;
    kind: "media" | "attachment";
  },
): Promise<string> {
  const slotResponse = await request.post(`/api/projects/${projectId}/files`, {
    data: {
      filename: options.filename,
      size: options.data.length,
      mime_type: options.mimeType,
      kind: options.kind,
    },
  });
  expect(slotResponse.ok()).toBeTruthy();
  const slot = await slotResponse.json();

  // Presigned POST straight to MinIO through nginx; the file field must come
  // after the signature fields.
  const storageResponse = await request.post(slot.upload_url, {
    multipart: {
      ...slot.upload_fields,
      file: {
        name: options.filename,
        mimeType: options.mimeType,
        buffer: options.data,
      },
    },
  });
  expect(storageResponse.ok()).toBeTruthy();

  const confirmResponse = await request.post(
    `/api/files/${slot.file.id}/confirm`,
  );
  expect(confirmResponse.ok()).toBeTruthy();
  return slot.file.id;
}

export async function patchProject(
  request: APIRequestContext,
  projectId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const response = await request.patch(`/api/projects/${projectId}`, {
    data: body,
  });
  expect(response.ok()).toBeTruthy();
}
