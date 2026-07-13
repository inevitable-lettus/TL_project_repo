import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectCard } from "@/components/project-card";
import { Badge, buttonClass, Window } from "@/components/ui";
import { api, ApiError, coverIdFor, coverUrlMap } from "@/lib/api";
import type { Profile } from "@/lib/types";

async function fetchProfile(id: string): Promise<{
  profile: Profile;
  cookie: string;
}> {
  const cookie = (await cookies()).toString();
  try {
    return { profile: await api.profile(id, cookie), cookie };
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
  const { profile } = await fetchProfile((await params).id);
  return { title: `${profile.name} — Tinkerer Lab` };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile, cookie } = await fetchProfile((await params).id);
  const [covers, avatarUrl, viewer] = await Promise.all([
    coverUrlMap(profile.projects, cookie),
    profile.avatar_file_id
      ? api.downloadUrl(profile.avatar_file_id, cookie).then((r) => r.url)
      : Promise.resolve(undefined),
    api.me(cookie).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <Window
        title="PROFILE.CARD"
        floating
        titleBarExtra={
          viewer?.id === profile.id ? (
            <Link
              href="/settings"
              className={buttonClass("tertiary")}
              data-testid="edit-profile"
            >
              Edit profile
            </Link>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-5 p-1 sm:flex-row sm:items-start sm:gap-7 md:p-2">
          {avatarUrl ? (
            // Presigned URL — must not go through the Next image optimizer.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={profile.name}
              className="size-28 shrink-0 rounded-base border border-border-default object-cover shadow-menu md:size-36"
            />
          ) : (
            <div className="grid size-28 shrink-0 place-items-center rounded-base border border-border-default bg-neutral-secondary-soft font-serif text-4xl text-heading md:size-36">
              {profile.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-balance text-[30px] md:text-[38px]">
                {profile.name}
              </h1>
              {profile.role === "staff" && (
                <Badge variant="brand" mono>
                  staff
                </Badge>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {profile.program && (
                <Badge variant="gray" mono>
                  {profile.program}
                </Badge>
              )}
              {profile.enrollment_year && (
                <Badge variant="neutral" mono>
                  CLASS_OF_{profile.enrollment_year}
                </Badge>
              )}
            </div>
            {profile.bio && (
              <p className="mt-4 max-w-[65ch] text-[15px] leading-[1.65] text-body">
                {profile.bio}
              </p>
            )}
          </div>
        </div>
      </Window>

      <Window title={`PROJECTS.DIR (${profile.projects.length})`}>
        {profile.projects.length > 0 ? (
          <div
            data-testid="profile-projects"
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {profile.projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                coverUrl={covers[coverIdFor(p) ?? ""]}
                showVisibility={!p.is_public}
              />
            ))}
          </div>
        ) : (
          <p className="text-[15px] leading-[1.65]">No projects yet.</p>
        )}
      </Window>
    </div>
  );
}
