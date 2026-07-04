import Link from "next/link";
import { Badge, SysLabel } from "@/components/ui";
import { formatDate } from "@/lib/format";
import type { ProjectListItem } from "@/lib/types";

// Window-styled card: project title as the window title, cover as the body.
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
    <Link href={`/projects/${project.id}`} className="group block">
      <article className="overflow-hidden rounded-base border border-border-default bg-neutral-primary-soft transition-colors duration-[120ms] group-hover:border-border-default-strong">
        <header className="flex h-8 items-center gap-2 border-b border-border-default bg-menu-bar px-3">
          <span className="truncate text-[13px] font-semibold text-heading">
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
          <div className="grid aspect-[4/3] w-full place-items-center bg-neutral-secondary-soft">
            <SysLabel>NO_COVER.IMG</SysLabel>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 border-t border-border-default px-3 py-2 transition-colors duration-[120ms] group-hover:bg-neutral-secondary-medium">
          <span className="truncate text-[13px] text-body">
            {project.owner_name}
          </span>
          <SysLabel>{formatDate(project.created_at)}</SysLabel>
        </div>
      </article>
    </Link>
  );
}
