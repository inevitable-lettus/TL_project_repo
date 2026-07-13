import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { ReportForm } from "./report-form";

export const metadata: Metadata = { title: "Report an issue — Tinkerer Lab" };
export const dynamic = "force-dynamic";

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ machine?: string }>;
}) {
  const cookie = (await cookies()).toString();
  try {
    await api.me(cookie);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect("/api/auth/login");
    }
    throw error;
  }

  const { machine } = await searchParams;
  let machines: { slug: string; name: string }[] = [];
  try {
    machines = await api.machines();
  } catch (error) {
    // The report form still works when the sheet is down — machine becomes
    // optional freeform context anyway.
    if (!(error instanceof ApiError && error.status === 503)) throw error;
  }

  return <ReportForm machines={machines} initialMachine={machine ?? ""} />;
}
