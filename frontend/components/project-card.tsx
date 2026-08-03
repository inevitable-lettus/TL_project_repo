import Link from "next/link";
import { Badge, SysLabel } from "@/components/ui";
import { formatDate } from "@/lib/format";
import type { ProjectListItem } from "@/lib/types";

// Window-styled card: project title as the window title, cover as the body.
// The lift is CSS rather than Motion — these render dozens to a grid and none
// of them need a client boundary for a hover state.
export function ProjectCard({
  project,
  coverUrl,
  showVisibility = false,
}: {
  project: ProjectListItem;
  coverUrl?: string;
  showVisibility?: boolean;
}) {
  return (
    <Link href={`/projects/${project.id}`} className="group block h-full">
      <article className="flex h-full flex-col overflow-hidden rounded-base border-2 border-border-default-strong bg-neutral-primary-soft shadow-menu transition-[transform,box-shadow] duration-120 ease-out-quart group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 group-hover:shadow-window group-active:translate-x-0 group-active:translate-y-0 group-active:shadow-none motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 motion-reduce:group-hover:translate-y-0">
        <header className="flex h-9 items-center gap-2 border-b-2 border-border-default-strong bg-menu-bar px-3">
          <span className="truncate font-display text-sm font-bold text-heading">
            {project.title}
          </span>
          {showVisibility && (
            <span className="ml-auto shrink-0">
              <Badge variant={project.is_public ? "success" : "warning"} mono>
                {project.is_public ? "public" : "private"}
              </Badge>
            </span>
          )}
        </header>
        {coverUrl ? (
          // Presigned URLs expire in minutes — never route them through the
          // Next.js image optimizer/cache.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            className="aspect-[4/3] w-full object-cover"
          />
        ) : (
          <div className="blueprint-grid grid aspect-[4/3] w-full place-items-center bg-neutral-secondary-soft">
            <SysLabel>NO_COVER.IMG</SysLabel>
          </div>
        )}
        {project.description && (
          <p className="line-clamp-2 border-t border-border-default-subtle px-3 py-2 text-sm text-body-subtle">
            {project.description}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 border-t-2 border-border-default-strong px-3 py-2 transition-colors duration-120 group-hover:bg-brand-softer">
          <span className="truncate text-sm text-body">
            {project.owner_name}
          </span>
          <SysLabel>{formatDate(project.created_at)}</SysLabel>
        </div>
      </article>
    </Link>
  );
}
