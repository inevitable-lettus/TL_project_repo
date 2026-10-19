"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

// `capture="environment"` opens the rear camera on phones and falls back to
// the file picker on desktop. Nothing is uploaded here: the parent uploads on
// submit so an abandoned form leaves nothing in storage. Remount (key) to clear.
export function PhotoPicker({
  testId,
  disabled,
  onChange,
}: {
  testId: string;
  disabled: boolean;
  onChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const choose = (file: File | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = file ? URL.createObjectURL(file) : null;
    setPreviewUrl(urlRef.current);
    onChange(file);
  };

  const openCamera = () => inputRef.current?.click();

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        data-testid={testId}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => {
          choose(event.target.files?.[0] ?? null);
          event.target.value = ""; // picking the same photo again must fire
        }}
      />
      {previewUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Photo to upload"
            className="max-h-72 w-full rounded-base border-2 border-border-default-strong bg-neutral-secondary-soft object-contain"
          />
          <Button
            type="button"
            variant="tertiary"
            className="min-h-11"
            disabled={disabled}
            onClick={openCamera}
          >
            Retake
          </Button>
        </>
      ) : (
        <Button
          type="button"
          size="lg"
          className="min-h-11 w-full"
          disabled={disabled}
          onClick={openCamera}
        >
          Take photo
        </Button>
      )}
    </div>
  );
}
