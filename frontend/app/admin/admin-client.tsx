"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { DUR, EASE } from "@/lib/motion";
import type { ProjectListItem, User } from "@/lib/types";
import {
  Badge,
  Button,
  buttonClass,
  inputClass,
  SysLabel,
  Window,
} from "@/components/ui";

type Tab = "curation" | "people" | "moderation";

const tabClass = (active: boolean) =>
  "relative px-3.5 py-3 font-display text-xs font-bold uppercase tracking-[0.06em] " +
  "transition-colors duration-120 " +
  (active ? "text-fg-brand" : "text-body hover:text-heading");

export function AdminClient({
  me,
  initialFeatured,
  initialUsers,
  initialProjects,
}: {
  me: User;
  initialFeatured: ProjectListItem[];
  initialUsers: User[];
  initialProjects: ProjectListItem[];
}) {
  const [tab, setTab] = useState<Tab>("curation");
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6">
      <Window title="ADMIN.PANEL" floating bodyClassName="p-0">
        <nav
          role="tablist"
          className="flex overflow-x-auto border-b-2 border-border-default-strong px-3"
        >
          {(
            [
              ["curation", "Curation"],
              ["people", "People"],
              ["moderation", "Moderation"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              data-testid={`tab-${key}`}
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={tabClass(tab === key)}
            >
              {label}
              {tab === key && (
                <motion.span
                  aria-hidden
                  layoutId="admin-tab-underline"
                  transition={{ duration: DUR.base, ease: EASE.outExpo }}
                  className="absolute inset-x-0 -bottom-0.5 h-1 bg-brand"
                />
              )}
            </button>
          ))}
        </nav>
        <div className="p-5 md:p-6">
          {tab === "curation" && (
            <CurationTab
              initialFeatured={initialFeatured}
              projects={initialProjects}
              run={run}
            />
          )}
          {tab === "people" && (
            <PeopleTab me={me} initialUsers={initialUsers} run={run} />
          )}
          {tab === "moderation" && (
            <ModerationTab initialProjects={initialProjects} run={run} />
          )}
          {error && (
            <p role="alert" className="mt-4 font-mono text-xs text-fg-danger">
              {error}
            </p>
          )}
        </div>
      </Window>
    </div>
  );
}

function CurationTab({
  initialFeatured,
  projects,
  run,
}: {
  initialFeatured: ProjectListItem[];
  projects: ProjectListItem[];
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const [featured, setFeatured] = useState(initialFeatured);
  const [pins, setPins] = useState(
    () => new Set(projects.filter((p) => p.slider_pinned).map((p) => p.id)),
  );
  const [candidateId, setCandidateId] = useState("");
  const publicProjects = projects.filter((p) => p.is_public);
  const candidates = publicProjects.filter(
    (p) => !featured.some((f) => f.id === p.id),
  );

  const putFeatured = (next: ProjectListItem[]) =>
    run(async () => {
      await api.adminSetFeatured(next.map((p) => p.id));
      setFeatured(next);
    });

  const move = (index: number, delta: number) => {
    const next = [...featured];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    void putFeatured(next);
  };

  const togglePin = (project: ProjectListItem) =>
    run(async () => {
      const { pinned } = await api.adminSetSliderPin(
        project.id,
        !pins.has(project.id),
      );
      setPins((current) => {
        const next = new Set(current);
        if (pinned) next.add(project.id);
        else next.delete(project.id);
        return next;
      });
    });

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="u-caps text-xl">Featured projects</h2>
          <a href="/" target="_blank" className={buttonClass("tertiary")}>
            Preview landing ↗
          </a>
        </div>
        {featured.length > 0 ? (
          <ol data-testid="featured-list" className="flex flex-col">
            {featured.map((project, index) => (
              <li
                key={project.id}
                className="flex items-center gap-3 border-b border-border-default-subtle px-2 py-3 transition-colors duration-120 last:border-b-0 hover:bg-brand-softer"
              >
                <SysLabel className="w-6 text-right">{index + 1}.</SysLabel>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-medium text-heading">
                    {project.title}
                  </span>
                  <SysLabel>{project.owner_name}</SysLabel>
                </span>
                <Button
                  variant="ghost"
                  aria-label={`Move ${project.title} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`Move ${project.title} down`}
                  disabled={index === featured.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </Button>
                <Button
                  variant="tertiary"
                  onClick={() =>
                    void putFeatured(
                      featured.filter((p) => p.id !== project.id),
                    )
                  }
                >
                  Remove
                </Button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-base text-body-subtle">
            Nothing featured yet — the landing grid is empty.
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <select
            aria-label="Project to feature"
            data-testid="feature-select"
            className={inputClass}
            value={candidateId}
            onChange={(e) => setCandidateId(e.target.value)}
          >
            <option value="">Pick a public project…</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} — {p.owner_name}
              </option>
            ))}
          </select>
          <Button
            data-testid="feature-add"
            disabled={!candidateId}
            onClick={() => {
              const project = candidates.find((p) => p.id === candidateId);
              if (!project) return;
              setCandidateId("");
              void putFeatured([...featured, project]);
            }}
          >
            Feature
          </Button>
        </div>
      </section>

      <section>
        <h2 className="u-caps mb-3 text-xl">Slider pins</h2>
        <p className="mb-3 text-sm text-body-subtle">
          Pinned projects (with a cover) lead the landing slideshow; the rest of
          the slots fill randomly.
        </p>
        <ul className="flex flex-col">
          {publicProjects.map((project) => (
            <li
              key={project.id}
              className="flex items-center gap-3 border-b border-border-default-subtle px-2 py-3 transition-colors duration-120 last:border-b-0 hover:bg-brand-softer"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium text-heading">
                  {project.title}
                </span>
                <SysLabel>
                  {project.owner_name}
                  {!project.cover_file_id && " — NO_COVER"}
                </SysLabel>
              </span>
              {pins.has(project.id) && (
                <Badge variant="brand" mono>
                  pinned
                </Badge>
              )}
              <Button variant="tertiary" onClick={() => togglePin(project)}>
                {pins.has(project.id) ? "Unpin" : "Pin"}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function PeopleTab({
  me,
  initialUsers,
  run,
}: {
  me: User;
  initialUsers: User[];
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState("");

  const search = () =>
    run(async () => {
      setUsers(await api.adminUsers(query));
    });

  const setRole = (user: User, role: "staff" | "student") =>
    run(async () => {
      const updated = await api.adminSetRole(user.id, role);
      setUsers((current) =>
        current.map((u) => (u.id === user.id ? updated : u)),
      );
    });

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          aria-label="Search people"
          className={inputClass}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email"
        />
        <Button type="submit" variant="tertiary">
          Search
        </Button>
      </form>
      <ul data-testid="people-list" className="flex flex-col">
        {users.map((user) => (
          <li
            key={user.id}
            className="flex flex-wrap items-center gap-3 border-b border-border-default-subtle px-2 py-3 transition-colors duration-120 last:border-b-0 hover:bg-brand-softer"
          >
            <span className="min-w-0 flex-1">
              <Link
                href={`/users/${user.id}`}
                className="block truncate text-base font-medium text-heading underline-offset-2 hover:underline"
              >
                {user.name}
              </Link>
              <SysLabel>{user.email}</SysLabel>
            </span>
            <Badge variant={user.role === "staff" ? "brand" : "neutral"} mono>
              {user.role}
            </Badge>
            {user.role === "staff" ? (
              <Button
                variant="tertiary"
                disabled={user.id === me.id}
                title={
                  user.id === me.id ? "You cannot demote yourself" : undefined
                }
                onClick={() => setRole(user, "student")}
              >
                Demote
              </Button>
            ) : (
              <Button variant="tertiary" onClick={() => setRole(user, "staff")}>
                Promote
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ModerationTab({
  initialProjects,
  run,
}: {
  initialProjects: ProjectListItem[];
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [query, setQuery] = useState("");

  const search = () =>
    run(async () => {
      setProjects((await api.adminProjects(query)).items);
    });

  const toggleVisibility = (project: ProjectListItem) =>
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
          `Delete "${project.title}" by ${project.owner_name}? This removes all of its files and cannot be undone.`,
        )
      ) {
        return;
      }
      await api.deleteProject(project.id);
      setProjects((current) => current.filter((p) => p.id !== project.id));
    });

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          aria-label="Search projects"
          className={inputClass}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title or owner"
        />
        <Button type="submit" variant="tertiary">
          Search
        </Button>
      </form>
      <ul data-testid="moderation-list" className="flex flex-col">
        {projects.map((project) => (
          <li
            key={project.id}
            className="flex flex-wrap items-center gap-3 border-b border-border-default-subtle px-2 py-3 transition-colors duration-120 last:border-b-0 hover:bg-brand-softer"
          >
            <span className="min-w-0 flex-1">
              <Link
                href={`/projects/${project.id}`}
                className="block truncate text-base font-medium text-heading underline-offset-2 hover:underline"
              >
                {project.title}
              </Link>
              <SysLabel>{project.owner_name}</SysLabel>
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
              <Link
                href={`/dashboard/${project.id}`}
                className={buttonClass("tertiary")}
              >
                Edit
              </Link>
              <Button
                variant="tertiary"
                onClick={() => toggleVisibility(project)}
              >
                {project.is_public ? "Hide" : "Show"}
              </Button>
              <Button variant="danger" onClick={() => remove(project)}>
                Delete
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
