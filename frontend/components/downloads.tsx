"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button, SysLabel } from "@/components/ui";
import { formatBytes } from "@/lib/format";
import type { FileInfo } from "@/lib/types";

// Downloads list. URLs are minted on click — presigned links expire in
// minutes, so a page left open must never reuse a stale one (design.md).
export function Downloads({ files }: { files: FileInfo[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = async (file: FileInfo) => {
    // The tab must be opened synchronously inside the click. Opening it after
    // the await spends the user gesture, and Safari and Firefox block it —
    // the button then looks like it does nothing. No "noopener" feature here:
    // it makes window.open return null, and we need the handle to point the
    // tab at the URL once it arrives. The back-reference is cut instead.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setBusyId(file.id);
    setError(null);
    try {
      const { url } = await api.downloadUrl(file.id);
      if (tab) tab.location.href = url;
      else window.location.assign(url); // popups blocked entirely
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : "download failed");
    } finally {
      setBusyId(null);
    }
  };

  // File-manager manifest: mono filename column, right-aligned size column.
  return (
    <>
      {error && (
        <p role="alert" className="mb-2 font-mono text-xs text-fg-danger">
          {error}
        </p>
      )}
      <ul className="flex flex-col">
        {files.map((file) => (
          <li
            key={file.id}
            className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-b border-border-default-subtle py-3 transition-colors duration-120 last:border-b-0 hover:bg-brand-softer sm:grid-cols-[1fr_auto_auto] sm:gap-x-5"
          >
            <span className="min-w-0">
              <span className="block truncate font-mono text-sm font-medium text-heading">
                {file.filename}
              </span>
              <SysLabel className="sm:hidden">
                {file.mime_type} · {formatBytes(file.size)}
              </SysLabel>
            </span>
            <span className="hidden text-right sm:block">
              <SysLabel>{file.mime_type}</SysLabel>
              <SysLabel className="block text-heading">
                {formatBytes(file.size)}
              </SysLabel>
            </span>
            <Button
              variant="tertiary"
              disabled={busyId === file.id}
              onClick={() => download(file)}
              data-testid={`download-${file.id}`}
            >
              Download
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}
