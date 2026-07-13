import type { Metadata } from "next";
import Link from "next/link";
import { Badge, buttonClass, SysLabel, Window } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Machine } from "@/lib/types";

export const metadata: Metadata = { title: "Machines — Tinkerer Lab" };

// Status is staff-edited in a Google Sheet and cached briefly server-side,
// so this page must always render fresh.
export const dynamic = "force-dynamic";

const statusBadge: Record<
  Machine["status"],
  { variant: "success" | "brand" | "warning" | "gray"; label: string }
> = {
  available: { variant: "success", label: "AVAILABLE" },
  in_use: { variant: "brand", label: "IN_USE" },
  maintenance: { variant: "warning", label: "MAINTENANCE" },
  offline: { variant: "gray", label: "OFFLINE" },
};

export default async function MachinesPage() {
  let machines: Machine[] | null = null;
  try {
    machines = await api.machines();
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 503)) throw error;
  }

  // Group by category, keeping the sheet's row order within and across groups.
  const groups = new Map<string, Machine[]>();
  for (const machine of machines ?? []) {
    const group = groups.get(machine.category);
    if (group) group.push(machine);
    else groups.set(machine.category, [machine]);
  }

  return (
    <div className="flex flex-col gap-8">
      <Window title="MACHINES.DIR" floating>
        <div className="mb-6 border-b border-border-default-subtle pb-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-[26px] md:text-[32px]">The machines</h1>
            <Link href="/report" className={buttonClass("tertiary")}>
              Report an issue
            </Link>
          </div>
          <p className="mt-2 max-w-[60ch] text-[15px] leading-[1.65] text-body-subtle">
            What&apos;s on the lab floor and whether it&apos;s free right now.
            Status is kept current by lab staff.
          </p>
        </div>

        {machines === null ? (
          <p className="text-[15px] leading-[1.65] text-body-subtle">
            The machine list is unavailable right now — check back shortly or
            ask at the lab desk.
          </p>
        ) : groups.size === 0 ? (
          <p className="text-[15px] leading-[1.65] text-body-subtle">
            No machines listed yet.
          </p>
        ) : (
          <div data-testid="machines-list" className="flex flex-col gap-8">
            {[...groups.entries()].map(([category, items]) => (
              <section key={category} aria-label={category}>
                <SysLabel className="text-heading">
                  {category.toUpperCase().replaceAll(" ", "_")}/
                </SysLabel>
                <ul className="mt-3 flex flex-col">
                  {items.map((machine) => (
                    <li
                      key={machine.slug}
                      className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-b border-border-default-subtle py-3 last:border-b-0"
                    >
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[15px] font-medium text-heading">
                            {machine.name}
                          </span>
                          {machine.training_required && (
                            <Badge variant="neutral" mono>
                              TRAINING_REQUIRED
                            </Badge>
                          )}
                        </span>
                        {machine.notes && (
                          <span className="mt-0.5 block text-[13px] leading-[1.5] text-body-subtle">
                            {machine.notes}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge
                          variant={statusBadge[machine.status].variant}
                          mono
                        >
                          {statusBadge[machine.status].label}
                        </Badge>
                        {(machine.status === "available" ||
                          machine.status === "in_use") && (
                          <Link
                            href={`/machines/${machine.slug}/book`}
                            className={buttonClass("tertiary")}
                            data-testid={`book-${machine.slug}`}
                          >
                            Book
                          </Link>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Window>
    </div>
  );
}
