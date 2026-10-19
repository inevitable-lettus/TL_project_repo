"use client";

import { X } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui";

// `url` is the local preview (an object URL); whoever drops a photo revokes it.
export type PickedPhoto = { key: string; file: File; url: string };

export function pickPhoto(file: File): PickedPhoto {
  return { key: crypto.randomUUID(), file, url: URL.createObjectURL(file) };
}

export function dropPhotos(photos: PickedPhoto[]): void {
  photos.forEach((photo) => URL.revokeObjectURL(photo.url));
}

// Several photos for one loan. Like PhotoPicker, nothing is uploaded here:
// the form uploads on submit so an abandoned form leaves nothing in storage.
// `capture="environment"` opens the rear camera on phones.
export function PhotoGrid({
  photos,
  max,
  disabled,
  onAdd,
  onRemove,
}: {
  photos: PickedPhoto[];
  max: number;
  disabled: boolean;
  onAdd: (photo: PickedPhoto) => void;
  onRemove: (photo: PickedPhoto) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const full = photos.length >= max;

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        data-testid="borrow-photo-input"
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = ""; // picking the same photo again must fire
          if (file) onAdd(pickPhoto(file));
        }}
      />
      {photos.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo, index) => (
            <li
              key={photo.key}
              className="relative aspect-[4/3] overflow-hidden rounded-base border-2 border-border-default-strong bg-neutral-secondary-soft"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={`Photo ${index + 1} to upload`}
                className="size-full object-cover"
              />
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove photo ${index + 1}`}
                onClick={() => onRemove(photo)}
                className="absolute right-0 top-0 grid size-11 place-items-center border-b-2 border-l-2 border-border-default-strong bg-neutral-primary-soft text-heading disabled:cursor-not-allowed disabled:text-fg-disabled"
              >
                <X aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button
        type="button"
        size="lg"
        variant={photos.length > 0 ? "tertiary" : "primary"}
        className="min-h-11 w-full"
        disabled={disabled || full}
        onClick={() => inputRef.current?.click()}
      >
        Add photo
      </Button>
      <p
        data-testid="photo-count"
        className="font-mono text-xs text-body-subtle"
      >
        {photos.length} of {max} photos
        {photos.length === 0 && " · at least 1 needed"}
      </p>
    </div>
  );
}
