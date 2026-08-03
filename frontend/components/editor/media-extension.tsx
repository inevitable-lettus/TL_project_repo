"use client";

import { Node } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { DownloadUrl } from "@/lib/types";

// Presigned URLs expire in minutes; cache resolved ones briefly so typing
// around a media node doesn't re-mint on every re-render.
const URL_TTL_MS = 4 * 60 * 1000;
const cache = new Map<string, { resolved: DownloadUrl; at: number }>();

export async function resolveMedia(fileId: string): Promise<DownloadUrl> {
  const hit = cache.get(fileId);
  if (hit && Date.now() - hit.at < URL_TTL_MS) return hit.resolved;
  const resolved = await api.downloadUrl(fileId);
  cache.set(fileId, { resolved, at: Date.now() });
  return resolved;
}

function MediaView({ node, selected, deleteNode }: NodeViewProps) {
  const fileId = String(node.attrs.fileId ?? "");
  const [media, setMedia] = useState<DownloadUrl | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    resolveMedia(fileId)
      .then((resolved) => {
        if (!cancelled) setMedia(resolved);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  return (
    <NodeViewWrapper data-testid="editor-media">
      <figure
        className={`relative my-6 rounded-base border-2 transition-shadow duration-120 ${
          selected
            ? "border-border-default-strong shadow-hard-primary"
            : "border-border-default"
        }`}
      >
        {failed ? (
          <p className="p-4 font-mono text-xs text-fg-danger">
            media unavailable
          </p>
        ) : !media ? (
          <p className="p-4 font-mono text-xs text-body-subtle">
            loading media…
          </p>
        ) : media.mime_type.startsWith("video/") ? (
          <video src={media.url} controls className="w-full rounded-base" />
        ) : (
          // Presigned URL — must not go through the Next image optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.url}
            alt={media.filename}
            className="w-full rounded-base"
          />
        )}
        <button
          type="button"
          aria-label="Remove media"
          onClick={deleteNode}
          className="absolute right-2 top-2 grid size-7 place-items-center rounded-base border-2 border-border-default-strong bg-menu-bar text-sm font-bold text-heading transition-colors duration-120 hover:bg-danger hover:text-cream"
        >
          ✕
        </button>
      </figure>
    </NodeViewWrapper>
  );
}

// Matches the backend whitelist: block atom, attrs.fileId only.
export const Media = Node.create({
  name: "media",
  group: "block",
  atom: true,
  addAttributes() {
    return { fileId: { default: null } };
  },
  parseHTML() {
    return [{ tag: "figure[data-file-id]" }];
  },
  renderHTML({ node }) {
    return ["figure", { "data-file-id": node.attrs.fileId }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MediaView);
  },
});
