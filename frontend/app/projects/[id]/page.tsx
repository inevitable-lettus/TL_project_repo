import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Downloads } from "@/components/downloads";
import { collectMediaFileIds, TipTapRender } from "@/components/tiptap-render";
import { Badge, SysLabel, Window } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { ProjectDetail } from "@/lib/types";

async function fetchProject(id: string): Promise<{
  project: ProjectDetail;
  cookie: string;
}> {
  const cookie = (await cookies()).toString();
  try {
    return { project: await api.project(id, cookie), cookie };
  } catch (error) {
    if (error instanceof ApiError && [404, 422].includes(error.status)) {
      notFound(); // invisible and malformed ids look identical
    }
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { project } = await fetchProject((await params).id);
  return { title: `${project.title} — Tinkerer Lab` };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { project, cookie } = await fetchProject((await params).id);

  // One batch mint per render: every inline photo/video URL in a single call.
  const mediaIds = project.content ? collectMediaFileIds(project.content) : [];
  const mediaUrls =
    mediaIds.length > 0
      ? (await api.mediaUrls(project.id, mediaIds, cookie)).urls
      : {};

  const attachments = project.files.filter(
    (f) => f.kind === "attachment" && f.status === "ready",
  );

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-8">
      <Window title={`${project.title}.TXT`} floating>
        <article data-testid="project-article">
          <header className="mb-6 border-b border-border-default-subtle pb-5">
            <div className="flex items-start justify-between gap-3">
              <h1>{project.title}</h1>
              {!project.is_public && (
                <Badge variant="warning" mono>
                  private
                </Badge>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <Link
                href={`/users/${project.owner_id}`}
                className="text-[14px] font-medium text-fg-brand underline hover:no-underline"
              >
                {project.owner_name}
              </Link>
              <SysLabel>{formatDate(project.created_at)}</SysLabel>
            </div>
            {project.description && (
              <p className="mt-4 text-lg leading-[1.65]">
                {project.description}
              </p>
            )}
          </header>
          {project.content ? (
            <TipTapRender
              doc={project.content}
              mediaUrls={mediaUrls}
              files={project.files}
            />
          ) : (
            <p className="text-[15px] leading-[1.65] text-body-subtle">
              No write-up yet.
            </p>
          )}
        </article>
      </Window>

      {attachments.length > 0 && (
        <Window title="DOWNLOADS.DIR">
          <Downloads files={attachments} />
        </Window>
      )}
    </div>
  );
}
