import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { AdminClient } from "./admin-client";

export const metadata: Metadata = { title: "Admin — Tinkerer Lab" };

export default async function AdminPage() {
  const cookie = (await cookies()).toString();
  let data;
  try {
    const me = await api.me(cookie);
    if (me.role !== "staff") notFound(); // students get the same 404 as a bad URL
    const [featured, users, projects, bookings, checkouts, issues] =
      await Promise.all([
        api.featured(),
        api.adminUsers("", cookie),
        api.adminProjects("", cookie),
        api.adminBookings("", cookie),
        api.adminCheckouts("out", cookie),
        api.adminIssues("open", cookie),
      ]);
    data = {
      me,
      featured,
      users,
      projects: projects.items,
      bookings,
      checkouts,
      issues,
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect("/api/auth/login");
    }
    throw error;
  }
  return (
    <AdminClient
      me={data.me}
      initialFeatured={data.featured}
      initialUsers={data.users}
      initialProjects={data.projects}
      initialBookings={data.bookings}
      initialCheckouts={data.checkouts}
      initialIssues={data.issues}
    />
  );
}
