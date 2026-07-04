import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { EditorScreen } from "@/components/editor/editor-screen";
import { api, ApiError } from "@/lib/api";
import type { ProjectDetail, User } from "@/lib/types";

async function fetchEditable(id: string): Promise<ProjectDetail> {
  const cookie = (await cookies()).toString();
  let me: User;
  try {
    me = await api.me(cookie);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect("/api/auth/login");
    }
    throw error;
  }
  try {
    const project = await api.project(id, cookie);
    if (project.owner_id !== me.id && me.role !== "staff") notFound();
    return project;
  } catch (error) {
    if (error instanceof ApiError && [404, 422].includes(error.status)) {
      notFound();
    }
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const project = await fetchEditable((await params).id);
  return { title: `Editing ${project.title} — Tinkerer Lab` };
}

export default async function EditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const project = await fetchEditable((await params).id);
  return <EditorScreen project={project} />;
}
