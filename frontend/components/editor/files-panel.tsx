"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { downscaleImage } from "@/lib/image";
import type { FileInfo } from "@/lib/types";
import {
  uploadErrorMessage,
  uploadProjectFile,
  type UploadState,
} from "@/lib/upload";
import { Button, SysLabel, Window } from "@/components/ui";
import { resolveMedia } from "./media-extension";
import { UploadMeter } from "./upload-meter";

// Attachments manager + cover picker for the editor page. Uploads and
// deletes apply immediately; only the write-up needs an explicit Save.

export function AttachmentsPanel({
  projectId,
  initialFiles,
}: {
  projectId: string;
  initialFiles: FileInfo[];
}) {
  const [files, setFiles] = useState(
    initialFiles.filter((f) => f.kind === "attachment" && f.status === "ready"),
  );
  const [state, setState] = useState<UploadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setError(null);
    try {
      const ready = await uploadProjectFile(
        projectId,
        file,
        "attachment",
        setState,
      );
      setFiles((current) => [...current, ready]);
    } catch (err) {
      setError(uploadErrorMessage(err));
    } finally {
      setState(null);
    }
  };

  const remove = async (file: FileInfo) => {
    if (!window.confirm(`Delete ${file.filename}?`)) return;
    setError(null);
    try {
      await api.deleteFile(file.id);
      setFiles((current) => current.filter((f) => f.id !== file.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete failed");
    }
  };

  return (
    <Window
      title="ATTACHMENTS.DIR"
      titleBarExtra={
        <Button
          variant="tertiary"
          data-testid="add-attachment"
          disabled={state !== null}
          onClick={() => input.current?.click()}
        >
          Add file
        </Button>
      }
      bodyClassName="flex flex-col gap-3 p-5 md:p-6"
    >
      {files.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border-default-subtle">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-medium text-heading">
                  {file.filename}
                </span>
                <SysLabel>{formatBytes(file.size)}</SysLabel>
              </span>
              <Button variant="danger" onClick={() => remove(file)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[15px] leading-[1.65] text-body-subtle">
          No downloads yet. Attachments show up in the project&apos;s
          Downloads section.
        </p>
      )}
      <UploadMeter state={state} error={error} />
      <input
        ref={input}
        type="file"
        className="hidden"
        data-testid="attachment-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
    </Window>
  );
}

function CoverThumb({
  file,
  isCover,
  onPick,
}: {
  file: FileInfo;
  isCover: boolean;
  onPick: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    resolveMedia(file.id).then((media) => {
      if (!cancelled) setUrl(media.url);
    });
    return () => {
      cancelled = true;
    };
  }, [file.id]);

  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={isCover}
      className={`relative aspect-[4/3] overflow-hidden rounded-base border transition-colors duration-[120ms] ${
        isCover
          ? "border-border-brand shadow-press"
          : "border-border-default hover:border-border-default-strong"
      }`}
    >
      {url ? (
        // Presigned URL — must not go through the Next image optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={file.filename} className="size-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center font-mono text-[11px] text-body-subtle">
          …
        </span>
      )}
      {isCover && (
        <span className="absolute inset-x-0 bottom-0 bg-menu-bar/95 py-0.5 text-center font-mono text-[11px] tracking-[0.4px] text-heading">
          COVER
        </span>
      )}
    </button>
  );
}

export function CoverPicker({
  projectId,
  mediaFiles,
  initialCoverId,
}: {
  projectId: string;
  mediaFiles: FileInfo[];
  initialCoverId: string | null;
}) {
  const [coverId, setCoverId] = useState(initialCoverId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const images = mediaFiles.filter(
    (f) =>
      f.kind === "media" &&
      f.status === "ready" &&
      f.mime_type.startsWith("image/"),
  );

  // Downscale the picked image and upload the copy as a "thumb" file so
  // cards/slider stop loading the full-size original. Returns null when the
  // browser can't decode the format — the cover then serves cards directly.
  const makeThumb = async (fileId: string): Promise<string | null> => {
    const media = await resolveMedia(fileId);
    const original = await (await fetch(media.url)).blob();
    let small: Blob;
    try {
      small = await downscaleImage(original, 1280);
    } catch {
      return null;
    }
    const thumbFile = new File([small], "cover-thumb.webp", {
      type: "image/webp",
    });
    const ready = await uploadProjectFile(projectId, thumbFile, "thumb", () => {});
    return ready.id;
  };

  const pick = async (fileId: string | null) => {
    setError(null);
    setBusy(true);
    try {
      const thumbId = fileId === null ? null : await makeThumb(fileId);
      await api.updateProject(projectId, {
        cover_file_id: fileId,
        cover_thumb_file_id: thumbId,
      });
      setCoverId(fileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "cover update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title="COVER.PICK"
      titleBarExtra={
        coverId ? (
          <Button variant="tertiary" disabled={busy} onClick={() => pick(null)}>
            Remove cover
          </Button>
        ) : undefined
      }
      bodyClassName="flex flex-col gap-3 p-5 md:p-6"
    >
      {images.length > 0 ? (
        <div
          data-testid="cover-picker"
          className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5"
        >
          {images.map((file) => (
            <CoverThumb
              key={file.id}
              file={file}
              isCover={file.id === coverId}
              onPick={() => {
                if (!busy) void pick(file.id);
              }}
            />
          ))}
        </div>
      ) : (
        <p className="text-[15px] leading-[1.65] text-body-subtle">
          Embed an image in the write-up first — covers are picked from the
          project&apos;s images.
        </p>
      )}
      {error && (
        <p role="alert" className="font-mono text-[12px] text-fg-danger">
          {error}
        </p>
      )}
    </Window>
  );
}
