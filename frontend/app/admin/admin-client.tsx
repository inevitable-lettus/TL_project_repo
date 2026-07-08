"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import type {
  AdminBooking,
  AdminCheckout,
  AdminIssue,
  ProjectListItem,
  User,
} from "@/lib/types";
import { Badge, Button, buttonClass, inputClass, SysLabel, Window } from "@/components/ui";

type Tab = "curation" | "people" | "moderation" | "bookings" | "checkouts" | "issues";

const tabClass = (active: boolean) =>
  "rounded-t-base border-b-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors duration-[120ms] " +
  (active
    ? "border-border-brand text-fg-brand"
    : "border-transparent text-body hover:border-border-default-strong hover:text-heading");

export function AdminClient({
  me,
  initialFeatured,
  initialUsers,
  initialProjects,
  initialBookings,
  initialCheckouts,
  initialIssues,
}: {
  me: User;
  initialFeatured: ProjectListItem[];
  initialUsers: User[];
  initialProjects: ProjectListItem[];
  initialBookings: AdminBooking[];
  initialCheckouts: AdminCheckout[];
  initialIssues: AdminIssue[];
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
        <nav role="tablist" className="flex border-b border-border-default px-3">
          {(
            [
              ["curation", "Curation"],
              ["people", "People"],
              ["moderation", "Moderation"],
              ["bookings", "Bookings"],
              ["checkouts", "Checkouts"],
              ["issues", "Issues"],
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
            </button>
          ))}
        </nav>
        <div className="p-5 md:p-6">
          {tab === "curation" && (
            <CurationTab initialFeatured={initialFeatured} projects={initialProjects} run={run} />
          )}
          {tab === "people" && <PeopleTab me={me} initialUsers={initialUsers} run={run} />}
          {tab === "moderation" && (
            <ModerationTab initialProjects={initialProjects} run={run} />
          )}
          {tab === "bookings" && (
            <BookingsTab initialBookings={initialBookings} run={run} />
          )}
          {tab === "checkouts" && (
            <CheckoutsTab initialCheckouts={initialCheckouts} run={run} />
          )}
          {tab === "issues" && (
            <IssuesTab initialIssues={initialIssues} run={run} />
          )}
          {error && (
            <p role="alert" className="mt-4 font-mono text-[12px] text-fg-danger">
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
          <h2 className="text-[22px]">Featured projects</h2>
          <a href="/" target="_blank" className={buttonClass("tertiary")}>
            Preview landing ↗
          </a>
        </div>
        {featured.length > 0 ? (
          <ol data-testid="featured-list" className="flex flex-col divide-y divide-border-default-subtle">
            {featured.map((project, index) => (
              <li key={project.id} className="flex items-center gap-3 py-2">
                <SysLabel className="w-6 text-right">{index + 1}.</SysLabel>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-heading">
                    {project.title}
                  </span>
                  <SysLabel>{project.owner_name}</SysLabel>
                </span>
                <Button variant="ghost" aria-label={`Move ${project.title} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                  ↑
                </Button>
                <Button variant="ghost" aria-label={`Move ${project.title} down`} disabled={index === featured.length - 1} onClick={() => move(index, 1)}>
                  ↓
                </Button>
                <Button
                  variant="tertiary"
                  onClick={() => void putFeatured(featured.filter((p) => p.id !== project.id))}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[15px] leading-[1.65] text-body-subtle">
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
        <h2 className="mb-3 text-[22px]">Slider pins</h2>
        <p className="mb-3 text-[13px] text-body-subtle">
          Pinned projects (with a cover) lead the landing slideshow; the rest
          of the slots fill randomly.
        </p>
        <ul className="flex flex-col divide-y divide-border-default-subtle">
          {publicProjects.map((project) => (
            <li key={project.id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-heading">
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
      <ul data-testid="people-list" className="flex flex-col divide-y divide-border-default-subtle">
        {users.map((user) => (
          <li key={user.id} className="flex flex-wrap items-center gap-3 py-2">
            <span className="min-w-0 flex-1">
              <Link
                href={`/users/${user.id}`}
                className="block truncate text-[14px] font-medium text-heading underline-offset-2 hover:underline"
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
                title={user.id === me.id ? "You cannot demote yourself" : undefined}
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

const bookingStatusVariant: Record<
  AdminBooking["status"],
  "warning" | "success" | "danger" | "gray"
> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "gray",
};

function BookingsTab({
  initialBookings,
  run,
}: {
  initialBookings: AdminBooking[];
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const [bookings, setBookings] = useState(initialBookings);
  const [filter, setFilter] = useState<"pending" | "">("pending");

  const visible = filter
    ? bookings.filter((b) => b.status === filter)
    : bookings;

  const decide = (booking: AdminBooking, status: "approved" | "rejected") =>
    run(async () => {
      const updated = await api.adminDecideBooking(booking.id, status);
      setBookings((current) =>
        current.map((b) => (b.id === booking.id ? updated : b)),
      );
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[22px]">Machine bookings</h2>
        <select
          aria-label="Filter bookings"
          className={`${inputClass} w-auto`}
          value={filter}
          onChange={(e) => setFilter(e.target.value as "pending" | "")}
        >
          <option value="pending">Pending only</option>
          <option value="">All</option>
        </select>
      </div>
      {visible.length > 0 ? (
        <ul data-testid="bookings-list" className="flex flex-col divide-y divide-border-default-subtle">
          {visible.map((booking) => (
            <li key={booking.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-heading">
                  {booking.machine_slug} — {booking.user_name}
                </span>
                <SysLabel>
                  {booking.date} · {booking.start_time.slice(0, 5)}–
                  {booking.end_time.slice(0, 5)}
                </SysLabel>
                {booking.purpose && (
                  <span className="block truncate text-[13px] text-body-subtle">
                    {booking.purpose}
                  </span>
                )}
              </span>
              <Badge variant={bookingStatusVariant[booking.status]} mono>
                {booking.status}
              </Badge>
              {booking.status === "pending" && (
                <span className="flex gap-2">
                  <Button onClick={() => void decide(booking, "approved")}>
                    Approve
                  </Button>
                  <Button variant="tertiary" onClick={() => void decide(booking, "rejected")}>
                    Reject
                  </Button>
                </span>
              )}
              {booking.status === "approved" && (
                <Button variant="tertiary" onClick={() => void decide(booking, "rejected")}>
                  Reject
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[15px] leading-[1.65] text-body-subtle">
          {filter ? "No pending bookings." : "No bookings yet."}
        </p>
      )}
    </div>
  );
}

function CheckoutsTab({
  initialCheckouts,
  run,
}: {
  initialCheckouts: AdminCheckout[];
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const [checkouts, setCheckouts] = useState(initialCheckouts);

  const markReturned = (checkout: AdminCheckout) =>
    run(async () => {
      await api.returnCheckout(checkout.id);
      setCheckouts((current) => current.filter((c) => c.id !== checkout.id));
    });

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-[22px]">Tools out</h2>
      {checkouts.length > 0 ? (
        <ul data-testid="checkouts-list" className="flex flex-col divide-y divide-border-default-subtle">
          {checkouts.map((checkout) => (
            <li key={checkout.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-heading">
                  {checkout.tool_name}
                  {checkout.quantity > 1 && ` ×${checkout.quantity}`} —{" "}
                  {checkout.user_name}
                </span>
                <SysLabel>
                  {checkout.category} · due {checkout.due_date}
                </SysLabel>
              </span>
              {checkout.overdue && (
                <Badge variant="danger" mono>
                  overdue
                </Badge>
              )}
              <Button variant="tertiary" onClick={() => void markReturned(checkout)}>
                Mark returned
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[15px] leading-[1.65] text-body-subtle">
          Nothing is checked out.
        </p>
      )}
    </div>
  );
}

const severityVariant: Record<AdminIssue["severity"], "gray" | "neutral" | "warning" | "danger"> = {
  low: "gray",
  medium: "neutral",
  high: "warning",
  urgent: "danger",
};

function IssuesTab({
  initialIssues,
  run,
}: {
  initialIssues: AdminIssue[];
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const [issues, setIssues] = useState(initialIssues);

  const resolve = (issue: AdminIssue) =>
    run(async () => {
      await api.adminSetIssueStatus(issue.id, "resolved");
      setIssues((current) => current.filter((i) => i.id !== issue.id));
    });

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-[22px]">Open issues</h2>
      {issues.length > 0 ? (
        <ul data-testid="issues-list" className="flex flex-col divide-y divide-border-default-subtle">
          {issues.map((issue) => (
            <li key={issue.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-heading">
                  {issue.machine_slug ?? issue.type} — {issue.reporter_name}
                </span>
                <span className="block text-[13px] leading-[1.5] text-body">
                  {issue.description}
                </span>
                <SysLabel>{issue.type}</SysLabel>
              </span>
              <Badge variant={severityVariant[issue.severity]} mono>
                {issue.severity}
              </Badge>
              <Button variant="tertiary" onClick={() => void resolve(issue)}>
                Resolve
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[15px] leading-[1.65] text-body-subtle">
          No open issues.
        </p>
      )}
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
      <ul data-testid="moderation-list" className="flex flex-col divide-y divide-border-default-subtle">
        {projects.map((project) => (
          <li key={project.id} className="flex flex-wrap items-center gap-3 py-2">
            <span className="min-w-0 flex-1">
              <Link
                href={`/projects/${project.id}`}
                className="block truncate text-[14px] font-medium text-heading underline-offset-2 hover:underline"
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
              <Link href={`/dashboard/${project.id}`} className={buttonClass("tertiary")}>
                Edit
              </Link>
              <Button variant="tertiary" onClick={() => toggleVisibility(project)}>
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
