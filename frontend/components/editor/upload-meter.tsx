"use client";

import type { UploadState } from "@/lib/upload";

// Honest pending→processing→ready surface (design.md upload UX).
export function UploadMeter({
  state,
  error,
}: {
  state: UploadState | null;
  error: string | null;
}) {
  if (error) {
    return (
      <p
        data-testid="upload-error"
        className="rounded-base border border-border-danger-subtle bg-danger-soft px-2.5 py-1.5 font-mono text-[12px] text-fg-danger-strong"
        role="alert"
      >
        {error}
      </p>
    );
  }
  if (!state) return null;
  const label =
    state.phase === "uploading"
      ? `UPLOADING ${Math.round(state.fraction * 100)}%`
      : "PROCESSING…";
  return (
    <div
      data-testid="upload-meter"
      className="rounded-base border border-border-default bg-neutral-secondary-soft px-2.5 py-1.5"
    >
      <span className="font-mono text-[12px] tracking-[0.4px] text-body-subtle">
        {label}
      </span>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full border border-border-default bg-neutral-secondary-medium">
        <div
          className="h-full bg-brand transition-[width] duration-150"
          style={{
            width:
              state.phase === "uploading"
                ? `${Math.round(state.fraction * 100)}%`
                : "100%",
          }}
        />
      </div>
    </div>
  );
}
