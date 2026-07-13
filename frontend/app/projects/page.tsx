import type { Metadata } from "next";
import Link from "next/link";
import { ProjectCard } from "@/components/project-card";
import { SysLabel, Window } from "@/components/ui";
import { api, coverIdFor, coverUrlMap } from "@/lib/api";

export const metadata: Metadata = { title: "Browse — Tinkerer Lab" };

const PAGE_SIZE = 24;

const pageItem =
  "grid h-[34px] place-items-center border border-border-default bg-neutral-secondary-soft px-3 " +
  "text-[13px] font-medium text-body transition-colors duration-[120ms] " +
  "hover:bg-neutral-secondary-medium hover:text-heading";

export default async function Showcase({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: rawPage } = await searchParams;
  const page = Math.max(1, Number(rawPage) || 1);
  const { items, total } = await api.showcase(
    PAGE_SIZE,
    (page - 1) * PAGE_SIZE,
  );
  const covers = await coverUrlMap(items);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Window title="ALL_PROJECTS.DIR" floating>
      <div className="mb-6 border-b border-border-default-subtle pb-5">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-[26px] md:text-[32px]">The archive</h1>
          <SysLabel>{total} PROJECTS_ON_FILE</SysLabel>
        </div>
        <p className="mt-2 max-w-[55ch] text-[15px] leading-[1.65] text-body-subtle">
          Every public build from the lab, newest first.
        </p>
      </div>
      {items.length > 0 ? (
        <div
          data-testid="showcase-grid"
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {items.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              coverUrl={covers[coverIdFor(p) ?? ""]}
            />
          ))}
        </div>
      ) : (
        <p className="text-[15px] leading-[1.65]">No public projects yet.</p>
      )}
      {totalPages > 1 && (
        <nav
          aria-label="Pagination"
          className="mt-8 flex justify-center [&>*+*]:-ml-px"
        >
          {page > 1 ? (
            <Link
              href={`/projects?page=${page - 1}`}
              className={`${pageItem} rounded-l-base`}
            >
              Prev
            </Link>
          ) : (
            <span className={`${pageItem} rounded-l-base text-fg-disabled`}>
              Prev
            </span>
          )}
          <span className={`${pageItem} font-mono tabular-nums`}>
            {page}/{totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={`/projects?page=${page + 1}`}
              className={`${pageItem} rounded-r-base`}
            >
              Next
            </Link>
          ) : (
            <span className={`${pageItem} rounded-r-base text-fg-disabled`}>
              Next
            </span>
          )}
        </nav>
      )}
    </Window>
  );
}
