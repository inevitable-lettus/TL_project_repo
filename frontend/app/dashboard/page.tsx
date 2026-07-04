import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { DashboardClient } from "./dashboard-client";

export const metadata: Metadata = { title: "My projects — Tinkerer Lab" };

export default async function DashboardPage() {
  const cookie = (await cookies()).toString();
  let projects;
  try {
    projects = await api.myProjects(cookie);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect("/api/auth/login");
    }
    throw error;
  }
  return <DashboardClient initialProjects={projects} />;
}
