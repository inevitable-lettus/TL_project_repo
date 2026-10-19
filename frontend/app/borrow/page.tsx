import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { BorrowClient } from "./borrow-client";

export const metadata: Metadata = { title: "Borrow — Tinkerer Lab" };

async function loadBorrowData(cookie: string) {
  try {
    return await Promise.all([
      api.myLoans(cookie),
      api.loanRules(cookie),
      api.myProjects(cookie),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect("/api/auth/login");
    }
    throw error;
  }
}

export default async function BorrowPage() {
  const cookie = (await cookies()).toString();
  const [loans, rules, projects] = await loadBorrowData(cookie);
  return (
    <BorrowClient
      initialLoans={loans}
      rules={rules}
      projects={projects.map(({ id, title }) => ({ id, title }))}
    />
  );
}
