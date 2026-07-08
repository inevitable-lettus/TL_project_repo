import Link from "next/link";
import { ProjectCard } from "@/components/project-card";
import { Slider, type Slide } from "@/components/slider";
import { buttonClass, SysLabel, Window } from "@/components/ui";
import { api, coverIdFor, coverUrlMap } from "@/lib/api";
import type { ProjectListItem } from "@/lib/types";

// Landing = the lab's shop window, told in three beats: who we are
// (README), what's on the bench (slideshow), what's worth studying
// (featured, led by one big pick).
export default async function Home() {
  const [slider, featured] = await Promise.all([api.slider(), api.featured()]);
  const covers = await coverUrlMap([...slider, ...featured]);

  const slides: Slide[] = slider.flatMap((p) => {
    const coverId = coverIdFor(p);
    return coverId && covers[coverId]
      ? [
          {
            id: p.id,
            title: p.title,
            ownerName: p.owner_name,
            coverUrl: covers[coverId],
          },
        ]
      : [];
  });

  const [lead, ...restFeatured] = featured;

  return (
    <div className="flex flex-col gap-8 md:gap-14">
      <Window
        title="README.TXT"
        floating
        bodyClassName="p-6 md:px-10 md:py-12"
      >
        <div className="max-w-[720px]">
          <SysLabel>UNIVERSITY_TINKERER_LABORATORY // PUBLIC_ARCHIVE</SysLabel>
          <h1 className="mt-3 text-balance">
            Built by hand. Documented for keeps.
          </h1>
          <p className="mt-4 max-w-[60ch] text-[18px] leading-[1.65] text-body">
            Build stories from the university makerspace — the photos, the
            write-ups, and the CAD files to match, published by the students
            who made them.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/projects" className={buttonClass("primary", "lg")}>
              Browse the archive
            </Link>
            <Link href="/dashboard" className={buttonClass("tertiary", "lg")}>
              Start your write-up
            </Link>
          </div>
        </div>
      </Window>

      <div className="md:ml-[8%]">
        <Window title="SLIDESHOW.APP" floating bodyClassName="p-0">
          {slides.length > 0 ? (
            <Slider slides={slides} />
          ) : (
            <div className="grid aspect-[21/9] place-items-center bg-neutral-secondary-soft">
              <SysLabel>EMPTY_DESKTOP — no public projects with covers yet</SysLabel>
            </div>
          )}
        </Window>
      </div>

      <section aria-labelledby="featured-heading">
        <Window title="FEATURED_PROJECTS.DIR" floating>
          <h2 id="featured-heading" className="sr-only">
            Featured projects
          </h2>
          {featured.length > 0 ? (
            <div data-testid="featured-grid" className="flex flex-col gap-6">
              <p className="max-w-[55ch] text-[15px] leading-[1.65] text-body-subtle">
                Hand-picked by lab staff — the builds worth studying first.
              </p>
              {lead && (
                <FeaturedLead
                  project={lead}
                  coverUrl={covers[coverIdFor(lead) ?? ""]}
                />
              )}
              {restFeatured.length > 0 && (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {restFeatured.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      coverUrl={covers[coverIdFor(p) ?? ""]}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[15px] leading-[1.65]">
              Nothing featured yet. Staff curate this list from the admin
              dashboard.
            </p>
          )}
          <div className="mt-8 border-t border-border-default-subtle pt-5 text-center">
            <Link href="/projects" className={buttonClass("primary", "lg")}>
              Browse all projects
            </Link>
          </div>
        </Window>
      </section>
    </div>
  );
}

// The first featured project gets the big treatment: cover beside the pitch.
function FeaturedLead({
  project,
  coverUrl,
}: {
  project: ProjectListItem;
  coverUrl?: string;
}) {
  return (
    <Link href={`/projects/${project.id}`} className="group block">
      <article className="grid overflow-hidden rounded-base border border-border-default bg-neutral-primary-soft transition-colors duration-[120ms] group-hover:border-border-default-strong md:grid-cols-[3fr_2fr]">
        {coverUrl ? (
          // Presigned URL — must not go through the Next image optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            className="aspect-[16/10] w-full object-cover md:h-full md:min-h-[280px]"
          />
        ) : (
          <div className="grid aspect-[16/10] w-full place-items-center bg-neutral-secondary-soft">
            <SysLabel>NO_COVER.IMG</SysLabel>
          </div>
        )}
        <div className="flex flex-col gap-3 border-t border-border-default p-5 md:border-l md:border-t-0 md:p-7">
          <SysLabel>STAFF_PICK</SysLabel>
          <h3 className="text-balance">{project.title}</h3>
          {project.description && (
            <p className="line-clamp-4 text-[15px] leading-[1.65] text-body">
              {project.description}
            </p>
          )}
          <div className="mt-auto flex items-center justify-between gap-2 pt-3">
            <span className="truncate text-[13px] text-body">
              {project.owner_name}
            </span>
            <span className="font-mono text-[12px] tracking-[0.4px] text-fg-brand">
              OPEN →
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
