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

  return (
    <ul className="flex flex-col">
      {files.map((file) => (
        <li
          key={file.id}
          className="flex items-center gap-3 border-b border-border-default-subtle py-2.5 last:border-b-0"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-[13px] text-heading">
              {file.filename}
            </span>
            <SysLabel>
              {file.mime_type} · {formatBytes(file.size)}
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
