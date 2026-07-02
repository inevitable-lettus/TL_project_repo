"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { User } from "@/lib/types";

export function UserMenu() {
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch((error: unknown) => {
        if (!(error instanceof ApiError && error.status === 401)) throw error;
      })
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  if (!user) {
    return (
      <a href="/api/auth/login" data-testid="login-link">
        Log in
      </a>
    );
  }

  return (
    <div className="flex items-center gap-4" data-testid="user-menu">
      <Link href="/dashboard">My projects</Link>
      {user.role === "staff" && <Link href="/admin">Admin</Link>}
      <Link href={`/users/${user.id}`}>{user.name}</Link>
      <button
        type="button"
        onClick={() => api.logout().then(() => window.location.assign("/"))}
      >
        Log out
      </button>
    </div>
  );
}
