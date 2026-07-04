import Link from "next/link";
import { ProjectCard } from "@/components/project-card";
import { Slider, type Slide } from "@/components/slider";
import { buttonClass, SysLabel, Window } from "@/components/ui";
import { api, coverUrlMap } from "@/lib/api";

export default async function Home() {
  const [slider, featured] = await Promise.all([api.slider(), api.featured()]);
  const covers = await coverUrlMap([...slider, ...featured]);

  const slides: Slide[] = slider.flatMap((p) =>
    p.cover_file_id && covers[p.cover_file_id]
      ? [
          {
            id: p.id,
            title: p.title,
            ownerName: p.owner_name,
            coverUrl: covers[p.cover_file_id],
          },
        ]
      : [],
  );

  return (
    <div className="flex flex-col gap-8 md:gap-12">
      <h1 className="sr-only">Tinkerer Lab</h1>

      <Window title="SLIDESHOW.APP" floating bodyClassName="p-0">
        {slides.length > 0 ? (
          <Slider slides={slides} />
        ) : (
          <div className="grid aspect-[21/9] place-items-center bg-neutral-secondary-soft">
            <SysLabel>EMPTY_DESKTOP — no public projects with covers yet</SysLabel>
          </div>
        )}
      </Window>

      <section aria-labelledby="featured-heading">
        <Window title="FEATURED_PROJECTS.DIR">
          <h2 id="featured-heading" className="sr-only">
            Featured projects
          </h2>
          {featured.length > 0 ? (
            <div
              data-testid="featured-grid"
              className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
            >
              {featured.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  coverUrl={
                    p.cover_file_id ? covers[p.cover_file_id] : undefined
                  }
                />
              ))}
            </div>
          ) : (
            <p className="text-[15px] leading-[1.65]">
              Nothing featured yet. Staff curate this list from the admin
              dashboard.
            </p>
          )}
          <div className="mt-6 border-t border-border-default-subtle pt-5 text-center">
            <Link href="/projects" className={buttonClass("primary", "lg")}>
              Browse all projects
            </Link>
          </div>
        </Window>
      </section>
    </div>
  );
}
