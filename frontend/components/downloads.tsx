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

  const download = async (file: FileInfo) => {
    setBusyId(file.id);
    try {
      const { url } = await api.downloadUrl(file.id);
      window.open(url, "_blank", "noopener");
    } finally {
      setBusyId(null);
    }
  };

  // File-manager manifest: mono filename column, right-aligned size column.
  return (
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
  );
}
