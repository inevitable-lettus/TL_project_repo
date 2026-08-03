import Link from "next/link";
import { Stagger, StaggerItem } from "@/components/motion-primitives";
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
    <div className="flex flex-col gap-10 md:gap-20">
      {/* The hero sequences its own lines, so the window itself must not also
          reveal — nested reveals leave the inner children stuck at opacity 0. */}
      <Window
        title="README.TXT"
        floating
        reveal={false}
        bodyClassName="p-6 md:px-12 md:py-16"
      >
        <Stagger className="max-w-[860px]">
          <StaggerItem>
            <SysLabel className="text-fg-brand">
              UNIVERSITY_TINKERER_LABORATORY // PUBLIC_ARCHIVE
            </SysLabel>
          </StaggerItem>
          <StaggerItem>
            <h1 className="u-caps mt-4">
              Built by hand. Documented for keeps.
            </h1>
          </StaggerItem>
          <StaggerItem>
            <div
              aria-hidden
              className="mt-6 h-1.5 w-24 bg-safety-yellow ring-2 ring-border-default-strong"
            />
          </StaggerItem>
          <StaggerItem>
            <p className="mt-6 max-w-[60ch] text-lg text-body">
              Build stories from the university makerspace — the photos, the
              write-ups, and the CAD files to match, published by the students
              who made them.
            </p>
          </StaggerItem>
          <StaggerItem>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/projects" className={buttonClass("primary", "lg")}>
                Browse the archive
              </Link>
              <Link href="/dashboard" className={buttonClass("tertiary", "lg")}>
                Start your write-up
              </Link>
            </div>
          </StaggerItem>
        </Stagger>
      </Window>

      <div className="md:ml-[8%]">
        <Window title="SLIDESHOW.APP" floating bodyClassName="p-0">
          {slides.length > 0 ? (
            <Slider slides={slides} />
          ) : (
            <div className="blueprint-grid grid aspect-[21/9] place-items-center bg-neutral-secondary-soft">
              <SysLabel>
                EMPTY_DESKTOP — no public projects with covers yet
              </SysLabel>
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
            <div data-testid="featured-grid" className="flex flex-col gap-8">
              <p className="max-w-[55ch] text-base text-body-subtle">
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
            <p className="text-base">
              Nothing featured yet. Staff curate this list from the admin
              dashboard.
            </p>
          )}
          <div className="mt-10 border-t-2 border-dashed border-border-default-subtle pt-6 text-center">
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
      <article className="grid overflow-hidden rounded-base border-2 border-border-default-strong bg-neutral-primary-soft shadow-menu transition-[transform,box-shadow] duration-120 ease-out-quart group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 group-hover:shadow-window group-active:translate-x-0 group-active:translate-y-0 group-active:shadow-none motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 motion-reduce:group-hover:translate-y-0 md:grid-cols-[3fr_2fr]">
        {coverUrl ? (
          // Presigned URL — must not go through the Next image optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            className="aspect-[16/10] w-full object-cover md:h-full md:min-h-[320px]"
          />
        ) : (
          <div className="blueprint-grid grid aspect-[16/10] w-full place-items-center bg-neutral-secondary-soft">
            <SysLabel>NO_COVER.IMG</SysLabel>
          </div>
        )}
        <div className="flex flex-col gap-3 border-t-2 border-border-default-strong p-6 md:border-l-2 md:border-t-0 md:p-8">
          <span className="w-fit border border-border-default-strong bg-safety-yellow px-1.5 py-0.5 font-mono text-2xs font-bold uppercase tracking-[0.1em] text-ink">
            STAFF_PICK
          </span>
          <h3>{project.title}</h3>
          {project.description && (
            <p className="line-clamp-4 text-base text-body">
              {project.description}
            </p>
          )}
          <div className="mt-auto flex items-center justify-between gap-2 pt-4">
            <span className="truncate text-sm text-body">
              {project.owner_name}
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.1em] text-fg-brand">
              OPEN →
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
