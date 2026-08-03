"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { ProjectListItem } from "@/lib/types";
import {
  Badge,
  Button,
  Field,
  inputClass,
  SysLabel,
  Window,
} from "@/components/ui";

export function DashboardClient({
  initialProjects,
}: {
  initialProjects: ProjectListItem[];
}) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
    }
  };

  const create = () =>
    run(async () => {
      if (!title.trim()) return;
      setCreating(true);
      try {
        const project = await api.createProject({ title: title.trim() });
        router.push(`/dashboard/${project.id}`);
      } finally {
        setCreating(false);
      }
    });

  const toggle = (project: ProjectListItem) =>
    run(async () => {
      const updated = await api.updateProject(project.id, {
        is_public: !project.is_public,
      });
      setProjects((current) =>
        current.map((p) =>
          p.id === project.id ? { ...p, is_public: updated.is_public } : p,
        ),
      );
    });

  const remove = (project: ProjectListItem) =>
    run(async () => {
      if (
        !window.confirm(
          `Delete "${project.title}" and all of its files? This cannot be undone.`,
        )
      ) {
        return;
      }
      await api.deleteProject(project.id);
      setProjects((current) => current.filter((p) => p.id !== project.id));
    });

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
      <Window title="NEW_PROJECT.EXE" floating bodyClassName="p-5 md:p-6">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <div className="flex-1">
            <Field id="new-title" label="Project title">
              <input
                id="new-title"
                className={inputClass}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What are you building?"
                maxLength={200}
              />
            </Field>
          </div>
          <Button type="submit" disabled={creating || !title.trim()}>
            {creating ? "Creating…" : "Create"}
          </Button>
        </form>
      </Window>

      <Window title="MY_PROJECTS.DIR" bodyClassName="p-3 md:p-4">
        {projects.length > 0 ? (
          <ul data-testid="my-projects" className="flex flex-col">
            {projects.map((project) => (
              <li
                key={project.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-default-subtle px-2 py-3 transition-colors duration-120 last:border-b-0 hover:bg-brand-softer"
              >
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/dashboard/${project.id}`}
                    className="block truncate text-base font-medium text-heading underline-offset-2 hover:underline"
                  >
                    {project.title}
                  </Link>
                  <SysLabel>{formatDate(project.created_at)}</SysLabel>
                </span>
                {project.is_public ? (
                  <Badge variant="success" mono>
                    public
                  </Badge>
                ) : (
                  <Badge variant="warning" mono>
                    private
                  </Badge>
                )}
                <span className="flex gap-2">
                  <Button variant="tertiary" onClick={() => toggle(project)}>
                    {project.is_public ? "Make private" : "Make public"}
                  </Button>
                  <Button variant="danger" onClick={() => remove(project)}>
                    Delete
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-3 text-base text-body-subtle">
            Nothing here yet — create your first project above.
          </p>
        )}
        {error && (
          <p role="alert" className="p-2 font-mono text-xs text-fg-danger">
            {error}
          </p>
        )}
      </Window>
    </div>
  );
}
