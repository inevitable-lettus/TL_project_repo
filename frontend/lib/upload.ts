import { api, ApiError, uploadToStorage } from "./api";
import type { FileInfo, UploadSlot } from "./types";

// Honest upload states (design.md): uploading (bytes → MinIO), processing
// (confirm running), then the caller gets the ready FileInfo or an error.
export type UploadState =
  | { phase: "uploading"; fraction: number }
  | { phase: "processing" };

async function runUpload(
  slot: UploadSlot,
  file: File,
  onState: (state: UploadState) => void,
): Promise<FileInfo> {
  onState({ phase: "uploading", fraction: 0 });
  await uploadToStorage(slot, file, (fraction) =>
    onState({ phase: "uploading", fraction }),
  );
  onState({ phase: "processing" });
  return api.confirmUpload(slot.file.id);
}

export function uploadProjectFile(
  projectId: string,
  file: File,
  kind: "media" | "attachment" | "thumb",
  onState: (state: UploadState) => void,
): Promise<FileInfo> {
  return api
    .uploadSlot(projectId, {
      filename: file.name,
      size: file.size,
      mime_type: file.type || "application/octet-stream",
      kind,
    })
    .then((slot) => runUpload(slot, file, onState));
}

export function uploadAvatar(
  file: File,
  onState: (state: UploadState) => void,
): Promise<FileInfo> {
  return api
    .avatarSlot({
      filename: file.name,
      size: file.size,
      mime_type: file.type || "application/octet-stream",
    })
    .then((slot) => runUpload(slot, file, onState));
}

// Enforcement points 1 and 3 return a plain "file exceeds N GB limit"
// detail; point 2 (MinIO's content-length-range) rejects the POST itself,
// which uploadToStorage surfaces as "upload rejected by storage".
export function uploadErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.message === "upload rejected by storage") {
      return "file exceeds the size limit";
    }
    if (error.status !== 0 && error.message) return error.message;
  }
  return "upload failed — check your connection and try again";
}
