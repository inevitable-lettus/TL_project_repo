"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { menuLink } from "@/components/ui";
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
      <div className="flex items-center gap-1">
        <a href="/api/auth/login" data-testid="login-link" className={menuLink}>
          Log in
        </a>
        {process.env.NODE_ENV !== "production" && (
          <button
            type="button"
            data-testid="dev-login"
            className={menuLink}
            onClick={() =>
              api
                .testLogin("dev@local", "Dev User")
                .then(() => window.location.reload())
            }
          >
            Dev login
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1" data-testid="user-menu">
      <Link href="/borrow" className={menuLink}>
        Borrow
      </Link>
      <Link href="/dashboard" className={menuLink}>
        My projects
      </Link>
      {user.role === "staff" && (
        <Link href="/admin" className={menuLink}>
          Admin
        </Link>
      )}
      <Link href={`/users/${user.id}`} className={menuLink}>
        {user.name}
      </Link>
      <button
        type="button"
        className={menuLink}
        onClick={() => api.logout().then(() => window.location.assign("/"))}
      >
        Log out
      </button>
    </div>
  );
}
