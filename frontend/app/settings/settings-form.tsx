"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { downscaleImage } from "@/lib/image";
import type { Profile } from "@/lib/types";
import {
  uploadAvatar,
  uploadErrorMessage,
  type UploadState,
} from "@/lib/upload";
import { UploadMeter } from "@/components/editor/upload-meter";
import { Button, Field, inputClass, Window } from "@/components/ui";

export function SettingsForm({
  profile,
  initialAvatarUrl,
}: {
  profile: Profile;
  initialAvatarUrl: string | null;
}) {
  const [name, setName] = useState(profile.name);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [program, setProgram] = useState(profile.program ?? "");
  const [year, setYear] = useState(
    profile.enrollment_year ? String(profile.enrollment_year) : "",
  );
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [avatarState, setAvatarState] = useState<UploadState | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await api.updateMe({
        name: name.trim(),
        bio: bio.trim() || null,
        program: program.trim() || null,
        enrollment_year: year ? Number(year) : null,
      });
      setStatus("saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "save failed");
    } finally {
      setSaving(false);
    }
  };

  const changeAvatar = async (file: File) => {
    setAvatarError(null);
    try {
      // Avatars render at ~96px — downscale before upload. Undecodable
      // formats upload as-is; the backend still enforces an image mime.
      let toUpload = file;
      try {
        const small = await downscaleImage(file, 512);
        toUpload = new File([small], "avatar.webp", { type: "image/webp" });
      } catch {
        toUpload = file;
      }
      const ready = await uploadAvatar(toUpload, setAvatarState);
      await api.updateMe({ avatar_file_id: ready.id });
      setAvatarUrl((await api.downloadUrl(ready.id)).url);
    } catch (error) {
      setAvatarError(uploadErrorMessage(error));
    } finally {
      setAvatarState(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-8">
      <Window
        title="PROFILE.EDIT"
        floating
        bodyClassName="flex flex-col gap-4 p-5 md:p-6"
        titleBarExtra={
          <span className="flex items-center gap-2">
            {status && (
              <span
                data-testid="settings-status"
                className={`font-mono text-[12px] tracking-[0.4px] ${
                  status === "saved" ? "text-fg-success" : "text-fg-danger"
                }`}
              >
                {status.toUpperCase()}
              </span>
            )}
            <Button
              data-testid="save-settings"
              onClick={save}
              disabled={saving || !name.trim()}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </span>
        }
      >
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            // Presigned URL — must not go through the Next image optimizer.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={name}
              data-testid="avatar-preview"
              className="size-20 shrink-0 rounded-base border border-border-default object-cover"
            />
          ) : (
            <div className="grid size-20 shrink-0 place-items-center rounded-base border border-border-default bg-neutral-secondary-soft font-serif text-2xl text-heading">
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <Button
            variant="tertiary"
            data-testid="change-avatar"
            disabled={avatarState !== null}
            onClick={() => avatarInput.current?.click()}
          >
            Change photo
          </Button>
          <input
            ref={avatarInput}
            type="file"
            accept="image/*"
            className="hidden"
            data-testid="avatar-file-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void changeAvatar(file);
            }}
          />
        </div>
        <UploadMeter state={avatarState} error={avatarError} />

        <Field id="settings-name" label="Name">
          <input
            id="settings-name"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
        </Field>
        <Field id="settings-program" label="Program">
          <input
            id="settings-program"
            className={inputClass}
            value={program}
            onChange={(e) => setProgram(e.target.value)}
            placeholder="e.g. Mechanical Engineering"
            maxLength={200}
          />
        </Field>
        <Field id="settings-year" label="Enrollment year">
          <input
            id="settings-year"
            className={inputClass}
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            maxLength={4}
            placeholder="2024"
          />
        </Field>
        <Field id="settings-bio" label="About you">
          <textarea
            id="settings-bio"
            className={`${inputClass} min-h-[120px] resize-y`}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={2000}
            placeholder="What do you tinker with?"
          />
        </Field>
      </Window>
    </div>
  );
}
