import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Downloads } from "@/components/downloads";
import { collectMediaFileIds, TipTapRender } from "@/components/tiptap-render";
import { Badge, buttonClass, SysLabel, Window } from "@/components/ui";
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
  const viewer = await api.me(cookie).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  });
  const canEdit =
    viewer !== null &&
    (viewer.id === project.owner_id || viewer.role === "staff");

  // One batch mint per render: every inline photo/video URL in a single call.
  const mediaIds = project.content ? collectMediaFileIds(project.content) : [];
  const mediaUrls =
    mediaIds.length > 0
      ? (await api.mediaUrls(project.id, mediaIds, cookie)).urls
      : {};

  const attachments = project.files.filter(
    (f) => f.kind === "attachment" && f.status === "ready",
  );

  // The article opens on the full-size cover (not the card thumb) —
  // presigned per render like every other fetch.
  const coverUrl = project.cover_file_id
    ? (await api.downloadUrl(project.cover_file_id, cookie)).url
    : null;

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-8">
      <Window
        title={`${project.title}.TXT`}
        floating
        bodyClassName="p-0"
        titleBarExtra={
          canEdit ? (
            <Link
              href={`/dashboard/${project.id}`}
              className={buttonClass("tertiary")}
              data-testid="edit-project"
            >
              Edit
            </Link>
          ) : undefined
        }
      >
        <article data-testid="project-article">
          {coverUrl && (
            // Presigned URL — must not go through the Next image optimizer.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              className="max-h-[440px] w-full border-b border-border-default object-cover"
            />
          )}
          <div className="p-5 md:p-8">
            <header className="mb-6 border-b border-border-default-subtle pb-5">
              <h1 className="text-balance">{project.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Link
                  href={`/users/${project.owner_id}`}
                  className="text-[14px] font-medium text-fg-brand underline hover:no-underline"
                >
                  {project.owner_name}
                </Link>
                <span aria-hidden className="text-body-subtle">
                  ·
                </span>
                <SysLabel>{formatDate(project.created_at)}</SysLabel>
                {!project.is_public && (
                  <Badge variant="warning" mono>
                    private
                  </Badge>
                )}
              </div>
              {project.description && (
                <p className="mt-4 text-lg leading-[1.65] text-body">
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
          </div>
        </article>
      </Window>

      {attachments.length > 0 && (
        <Window title={`DOWNLOADS.DIR (${attachments.length})`}>
          <Downloads files={attachments} />
        </Window>
      )}
    </div>
  );
}
