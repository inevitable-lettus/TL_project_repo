import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { Loan } from "@/lib/types";
import { BorrowClient } from "./borrow-client";

export const metadata: Metadata = { title: "Borrow — Tinkerer Lab" };

export default async function BorrowPage() {
  const cookie = (await cookies()).toString();
  let loans: Loan[] | null;
  try {
    loans = await api.myLoans(cookie);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect("/api/auth/login");
    }
    if (error instanceof ApiError && error.status === 503) {
      loans = null; // borrowing not configured: show the state, not the error boundary
    } else {
      throw error;
    }
  }
  return <BorrowClient initialLoans={loans} />;
}
