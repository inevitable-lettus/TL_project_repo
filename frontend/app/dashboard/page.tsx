import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { DashboardClient } from "./dashboard-client";
import { MyBookings } from "./my-bookings";

export const metadata: Metadata = { title: "My projects — Tinkerer Lab" };

export default async function DashboardPage() {
  const cookie = (await cookies()).toString();
  let projects, bookings;
  try {
    [projects, bookings] = await Promise.all([
      api.myProjects(cookie),
      api.myBookings(cookie),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect("/api/auth/login");
    }
    throw error;
  }
  return (
    <div className="flex flex-col gap-8">
      <DashboardClient initialProjects={projects} />
      <div className="mx-auto w-full max-w-[760px]">
        <MyBookings initialBookings={bookings} />
      </div>
    </div>
  );
}
