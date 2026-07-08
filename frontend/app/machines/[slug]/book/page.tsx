import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { BookingForm } from "./booking-form";

export const metadata: Metadata = { title: "Book a machine — Tinkerer Lab" };
export const dynamic = "force-dynamic";

export default async function BookPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cookie = (await cookies()).toString();
  try {
    await api.me(cookie); // booking requires a real login
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect("/api/auth/login");
    }
    throw error;
  }

  const [machines, rules] = await Promise.all([
    api.machines(),
    api.bookingRules(),
  ]);
  const machine = machines.find((m) => m.slug === slug);
  if (!machine) notFound();

  return <BookingForm machine={machine} rules={rules} />;
}
