import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { ToolsClient } from "./tools-client";

export const metadata: Metadata = { title: "Tool checkout — Tinkerer Lab" };
export const dynamic = "force-dynamic";

export default async function ToolsPage() {
  const cookie = (await cookies()).toString();
  let checkouts;
  try {
    checkouts = await api.myCheckouts(cookie);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect("/api/auth/login");
    }
    throw error;
  }
  const categories = await api.toolCategories();
  return <ToolsClient categories={categories} initialCheckouts={checkouts} />;
}
