import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Edit profile — Tinkerer Lab" };

export default async function SettingsPage() {
  const cookie = (await cookies()).toString();
  let profile;
  let avatarUrl: string | null;
  try {
    const me = await api.me(cookie);
    profile = await api.profile(me.id, cookie);
    avatarUrl = profile.avatar_file_id
      ? (await api.downloadUrl(profile.avatar_file_id, cookie)).url
      : null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect("/api/auth/login");
    }
    throw error;
  }
  return <SettingsForm profile={profile} initialAvatarUrl={avatarUrl} />;
}
