import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { AdminClient } from "./admin-client";
import { NO_FILTERS } from "./loans-tab";

export const metadata: Metadata = { title: "Admin — Tinkerer Lab" };

export default async function AdminPage() {
  const cookie = (await cookies()).toString();
  let data;
  try {
    const me = await api.me(cookie);
    if (me.role !== "staff") notFound(); // students get the same 404 as a bad URL
    const [featured, users, projects, loans] = await Promise.all([
      api.featured(),
      api.adminUsers("", cookie),
      api.adminProjects("", cookie),
      api.adminLoans(NO_FILTERS, 0, cookie),
    ]);
    data = { me, featured, users, projects: projects.items, loans };
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
      initialLoans={data.loans}
    />
  );
}
