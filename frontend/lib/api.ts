import type {
  DownloadUrl,
  Profile,
  ProjectDetail,
  ProjectListItem,
  ProjectPage,
  UploadSlot,
  User,
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    detail: string,
  ) {
    super(detail);
  }
}

// In the browser everything goes through nginx at /api (same origin, cookie
// flows automatically). During SSR inside compose, talk to the backend
// container directly and forward the caller's cookie explicitly.
function baseUrl(): string {
  return typeof window === "undefined"
    ? (process.env.INTERNAL_API_URL ?? "http://backend:8000")
    : "/api";
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  cookie?: string; // SSR only: forward the incoming session cookie
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.cookie) headers.cookie = options.cookie;

  const response = await fetch(`${baseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      detail = (await response.json()).detail ?? detail;
    } catch {
      // non-JSON error body; keep statusText
    }
    throw new ApiError(response.status, detail);
  }
  return (await response.json()) as T;
}

export const api = {
  me: (cookie?: string) => request<User>("/auth/me", { cookie }),
  logout: () => request<{ status: string }>("/auth/logout", { method: "POST" }),

  showcase: (limit = 24, offset = 0) =>
    request<ProjectPage>(`/projects?limit=${limit}&offset=${offset}`),
  slider: () => request<ProjectListItem[]>("/projects/slider"),
  featured: () => request<ProjectListItem[]>("/projects/featured"),
  myProjects: (cookie?: string) =>
    request<ProjectListItem[]>("/projects/mine", { cookie }),
  project: (id: string, cookie?: string) =>
    request<ProjectDetail>(`/projects/${id}`, { cookie }),
  createProject: (body: { title: string; description?: string }) =>
    request<ProjectDetail>("/projects", { method: "POST", body }),
  updateProject: (id: string, body: Record<string, unknown>) =>
    request<ProjectDetail>(`/projects/${id}`, { method: "PATCH", body }),
  deleteProject: (id: string) =>
    request<{ status: string }>(`/projects/${id}`, { method: "DELETE" }),

  profile: (id: string, cookie?: string) =>
    request<Profile>(`/users/${id}`, { cookie }),
  updateMe: (body: Record<string, unknown>) =>
    request<User>("/users/me", { method: "PATCH", body }),

  uploadSlot: (
    projectId: string,
    body: { filename: string; size: number; mime_type: string; kind: "media" | "attachment" },
  ) => request<UploadSlot>(`/projects/${projectId}/files`, { method: "POST", body }),
  avatarSlot: (body: { filename: string; size: number; mime_type: string }) =>
    request<UploadSlot>("/users/me/avatar", { method: "POST", body }),
  confirmUpload: (fileId: string) =>
    request<UploadSlot["file"]>(`/files/${fileId}/confirm`, { method: "POST" }),
  deleteFile: (fileId: string) =>
    request<{ status: string }>(`/files/${fileId}`, { method: "DELETE" }),
  downloadUrl: (fileId: string, cookie?: string) =>
    request<DownloadUrl>(`/files/${fileId}/download-url`, { cookie }),
  mediaUrls: (projectId: string, fileIds: string[], cookie?: string) =>
    request<{ urls: Record<string, string> }>(`/projects/${projectId}/media-urls`, {
      method: "POST",
      body: { file_ids: fileIds },
      cookie,
    }),

  adminUsers: (q = "") =>
    request<User[]>(`/admin/users?q=${encodeURIComponent(q)}`),
  adminSetRole: (userId: string, role: "staff" | "student") =>
    request<User>(`/admin/users/${userId}`, { method: "PATCH", body: { role } }),
  adminSetFeatured: (projectIds: string[]) =>
    request<{ featured: number }>("/admin/featured", {
      method: "PUT",
      body: { project_ids: projectIds },
    }),
  adminSetSliderPin: (projectId: string, pinned: boolean) =>
    request<{ pinned: boolean }>(`/admin/projects/${projectId}/slider`, {
      method: "PATCH",
      body: { pinned },
    }),
};

// Resolve cover images for a list of projects: file id → fresh presigned URL.
// Presigning is cheap (local HMAC in the backend), so parallel per-cover calls
// are fine at this scale.
export async function coverUrlMap(
  projects: { cover_file_id: string | null }[],
  cookie?: string,
): Promise<Record<string, string>> {
  const ids = [...new Set(projects.flatMap((p) => p.cover_file_id ?? []))];
  const entries = await Promise.all(
    ids.map(async (id) => [id, (await api.downloadUrl(id, cookie)).url] as const),
  );
  return Object.fromEntries(entries);
}

// Direct-to-MinIO upload (the presigned POST form). Bytes never touch the
// backend. Returns when MinIO has accepted the object.
export async function uploadToStorage(
  slot: UploadSlot,
  file: Blob,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(slot.upload_fields)) {
      form.append(key, value);
    }
    form.append("file", file);

    const xhr = new XMLHttpRequest(); // fetch has no upload progress
    xhr.open("POST", slot.upload_url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total);
      }
    };
    xhr.onload = () =>
      xhr.status < 300
        ? resolve()
        : reject(new ApiError(xhr.status, "upload rejected by storage"));
    xhr.onerror = () => reject(new ApiError(0, "upload failed"));
    xhr.send(form);
  });
}
