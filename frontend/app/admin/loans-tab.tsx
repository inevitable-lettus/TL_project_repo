"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { UploadMeter } from "@/components/editor/upload-meter";
import {
  Badge,
  Button,
  buttonClass,
  Field,
  inputClass,
  Panel,
  SysLabel,
} from "@/components/ui";
import { ADMIN_LOAN_PAGE, api, ApiError, loanCsvUrl } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type {
  AdminLoan,
  AdminLoanPage,
  LoanFilters,
  LoanStatus,
} from "@/lib/types";
import {
  uploadErrorMessage,
  uploadLoanPhoto,
  type UploadState,
} from "@/lib/upload";
import { PhotoPicker } from "../borrow/photo-picker";

export const NO_FILTERS: LoanFilters = {
  status: "",
  type: "",
  q: "",
  from: "",
  to: "",
};

const fieldClass = `${inputClass} min-h-11`;

const STATUS_BADGE: Record<
  LoanStatus,
  "brand" | "danger" | "success" | "gray"
> = {
  out: "brand",
  overdue: "danger",
  returned: "success",
  used: "gray",
};

function amount(loan: AdminLoan): string {
  return `${loan.quantity} ${loan.unit}`;
}

function FilterBar({
  applied,
  onApply,
}: {
  applied: LoanFilters;
  onApply: (filters: LoanFilters) => void;
}) {
  const [draft, setDraft] = useState(applied);
  // Selects and dates apply at once; the search box applies on submit.
  const set = <K extends keyof LoanFilters>(key: K, value: LoanFilters[K]) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    if (key !== "q") onApply(next);
  };

  return (
    <form
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        onApply(draft);
      }}
    >
      <Field id="loan-filter-status" label="Status">
        <select
          id="loan-filter-status"
          className={fieldClass}
          value={draft.status}
          onChange={(event) =>
            set("status", event.target.value as LoanFilters["status"])
          }
        >
          <option value="">Any status</option>
          <option value="out">out</option>
          <option value="overdue">overdue</option>
          <option value="returned">returned</option>
          <option value="used">used</option>
        </select>
      </Field>
      <Field id="loan-filter-type" label="Type">
        <select
          id="loan-filter-type"
          className={fieldClass}
          value={draft.type}
          onChange={(event) =>
            set("type", event.target.value as LoanFilters["type"])
          }
        >
          <option value="">Any type</option>
          <option value="equipment">equipment</option>
          <option value="material">material</option>
        </select>
      </Field>
      <Field id="loan-filter-from" label="Borrowed from">
        <input
          id="loan-filter-from"
          type="date"
          className={fieldClass}
          value={draft.from}
          onChange={(event) => set("from", event.target.value)}
        />
      </Field>
      <Field id="loan-filter-to" label="Borrowed to">
        <input
          id="loan-filter-to"
          type="date"
          className={fieldClass}
          value={draft.to}
          onChange={(event) => set("to", event.target.value)}
        />
      </Field>
      <div className="col-span-2 flex gap-2 sm:col-span-4">
        <input
          aria-label="Search loans"
          className={`${fieldClass} min-w-0 flex-1`}
          value={draft.q}
          maxLength={200}
          onChange={(event) => setDraft({ ...draft, q: event.target.value })}
          placeholder="Item, borrower name or email"
        />
        <Button type="submit" variant="tertiary" className="min-h-11">
          Search
        </Button>
      </div>
    </form>
  );
}

function PhotoGrid({
  loan,
  urls,
}: {
  loan: AdminLoan;
  urls: Record<string, string>;
}) {
  const borrow = loan.photos.filter((photo) => photo.stage === "borrow");
  const labelled = [
    ...borrow.map((photo, index) => ({
      id: photo.file_id,
      label: borrow.length > 1 ? `Borrow photo ${index + 1}` : "Borrow photo",
    })),
    ...loan.photos
      .filter((photo) => photo.stage === "return")
      .map((photo) => ({ id: photo.file_id, label: "Return photo" })),
  ];
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {labelled.map(({ id, label }) => (
        <li key={id}>
          <a
            href={`/loans/photo/${id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col gap-1"
          >
            <span className="aspect-[4/3] overflow-hidden rounded-base border-2 border-border-default-strong bg-neutral-secondary-soft">
              {urls[id] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={urls[id]}
                  alt={label}
                  className="size-full object-cover"
                />
              )}
            </span>
            <SysLabel>{label}</SysLabel>
          </a>
        </li>
      ))}
    </ul>
  );
}

function MarkReturned({
  loan,
  onDone,
}: {
  loan: AdminLoan;
  onDone: () => Promise<void>;
}) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<UploadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A retry after a failed call reuses the photo already uploaded.
  const uploadedId = useRef<string | null>(null);
  const noteId = `staff-return-note-${loan.id}`;

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (photo && !uploadedId.current) {
        uploadedId.current = (await uploadLoanPhoto(photo, setState)).id;
      }
      setState(null);
      try {
        await api.adminReturnLoan(loan.id, {
          photo_file_id: photo ? uploadedId.current : null,
          note: note.trim(),
        });
      } catch (caught) {
        // Already returned (by the borrower, or an earlier try): just refresh.
        if (!(caught instanceof ApiError && caught.status === 409))
          throw caught;
      }
      await onDone();
    } catch (caught) {
      setError(uploadErrorMessage(caught));
    } finally {
      setState(null);
      setBusy(false);
    }
  };

  return (
    <Panel inset className="p-3">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <SysLabel>Photo of its condition (optional)</SysLabel>
        <PhotoPicker
          testId="staff-return-photo-input"
          disabled={busy}
          onChange={(file) => {
            uploadedId.current = null;
            setPhoto(file);
          }}
        />
        <Field id={noteId} label="Note (optional)">
          <textarea
            id={noteId}
            className={fieldClass}
            rows={2}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        <UploadMeter state={state} error={error} />
        <Button type="submit" className="min-h-11" disabled={busy}>
          {busy ? "Saving…" : "Confirm returned"}
        </Button>
      </form>
    </Panel>
  );
}

function LoanDetail({
  loan,
  urls,
  onChanged,
}: {
  loan: AdminLoan;
  urls: Record<string, string>;
  onChanged: () => Promise<void>;
}) {
  const [marking, setMarking] = useState(false);
  const open = loan.status === "out" || loan.status === "overdue";
  return (
    <div
      data-testid="loan-detail"
      className="flex w-full flex-col gap-3 px-2 pb-4"
    >
      <PhotoGrid loan={loan} urls={urls} />
      <p className="whitespace-pre-line break-words text-sm text-body">
        {loan.description}
      </p>
      {loan.project && (
        <Link
          href={`/projects/${loan.project.id}`}
          className="text-sm text-heading underline underline-offset-2"
        >
          {loan.project.title}
        </Link>
      )}
      {loan.returned_at && (
        <p data-testid="return-info" className="text-sm text-body">
          Returned {formatDate(loan.returned_at)} by{" "}
          {loan.returned_by?.name ?? "unknown"}
          {loan.return_note && <>: {loan.return_note}</>}
        </p>
      )}
      {open && (
        <>
          <Button
            type="button"
            variant="tertiary"
            className="min-h-11 self-start"
            aria-expanded={marking}
            onClick={() => setMarking((value) => !value)}
          >
            {marking ? "Cancel" : "Mark returned"}
          </Button>
          {marking && <MarkReturned loan={loan} onDone={onChanged} />}
        </>
      )}
    </div>
  );
}

function LoanRow({
  loan,
  onChanged,
}: {
  loan: AdminLoan;
  onChanged: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const detailId = `loan-${loan.id}`;

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    const missing = loan.photos
      .map((photo) => photo.file_id)
      .filter((id) => !urls[id]);
    if (!next || missing.length === 0) return;
    const entries = await Promise.all(
      missing.map(async (id) => {
        try {
          return [id, (await api.downloadUrl(id)).url] as const;
        } catch {
          return null; // the link under the tile still works
        }
      }),
    );
    setUrls((current) => ({
      ...current,
      ...Object.fromEntries(entries.filter((entry) => entry !== null)),
    }));
  };

  return (
    <li
      data-testid="admin-loan"
      className="border-b border-border-default-subtle last:border-b-0"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={() => void toggle()}
        className="grid min-h-11 w-full grid-cols-1 gap-1 px-2 py-3 text-left transition-colors duration-120 hover:bg-brand-softer sm:grid-cols-[1fr_1.4fr_auto] sm:items-center sm:gap-4"
      >
        <span className="min-w-0">
          <span className="block break-words text-base font-medium text-heading">
            {loan.item_name} × {amount(loan)}
          </span>
          <span className="block break-words text-sm text-body-subtle">
            {loan.borrower.name} · {loan.borrower.email}
          </span>
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <SysLabel>
            Borrowed {formatDate(loan.borrowed_at)}
            {loan.due_date && ` · due ${loan.due_date}`}
          </SysLabel>
          {loan.project && (
            <span className="break-words text-sm text-body-subtle">
              For {loan.project.title}
            </span>
          )}
        </span>
        <span className="flex gap-2">
          <Badge variant="neutral" mono>
            {loan.type}
          </Badge>
          <Badge variant={STATUS_BADGE[loan.status]} mono>
            {loan.status}
          </Badge>
        </span>
      </button>
      {expanded && (
        <div id={detailId}>
          <LoanDetail loan={loan} urls={urls} onChanged={onChanged} />
        </div>
      )}
    </li>
  );
}

export function LoansTab({
  initialPage,
  run,
}: {
  initialPage: AdminLoanPage;
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const [filters, setFilters] = useState(NO_FILTERS);
  const [page, setPage] = useState(initialPage);
  // Filters can change faster than the API answers; only the newest request
  // may set the list, or a slow older answer would overwrite it.
  const latest = useRef(0);

  const load = (next: LoanFilters) =>
    run(async () => {
      const request = ++latest.current;
      setFilters(next);
      const loaded = await api.adminLoans(next);
      if (request === latest.current) setPage(loaded);
    });

  const loadMore = () =>
    run(async () => {
      const request = latest.current;
      const more = await api.adminLoans(filters, page.items.length);
      if (request !== latest.current) return;
      setPage((current) => ({
        items: [...current.items, ...more.items],
        total: more.total,
      }));
    });

  // After a change, reload what is on screen so the row shows who returned it.
  const refresh = async () => {
    const request = ++latest.current;
    const reloaded = await api.adminLoans(filters);
    if (request === latest.current) setPage(reloaded);
  };

  return (
    <div className="flex flex-col gap-4">
      <FilterBar applied={filters} onApply={(next) => void load(next)} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SysLabel>
          <span data-testid="loan-total">{page.total}</span>{" "}
          {page.total === 1 ? "loan" : "loans"}
        </SysLabel>
        <a
          data-testid="loan-export"
          href={loanCsvUrl(filters)}
          download
          className={`${buttonClass("tertiary")} min-h-11`}
        >
          Export CSV
        </a>
      </div>
      <ul data-testid="admin-loans" className="flex flex-col">
        {page.items.map((loan) => (
          <LoanRow key={loan.id} loan={loan} onChanged={refresh} />
        ))}
      </ul>
      {page.items.length === 0 && (
        <p className="text-sm text-body-subtle">No loans match.</p>
      )}
      {page.items.length < page.total && (
        <Button
          type="button"
          variant="tertiary"
          className="min-h-11 self-center"
          onClick={() => void loadMore()}
        >
          Load {Math.min(ADMIN_LOAN_PAGE, page.total - page.items.length)} more
        </Button>
      )}
    </div>
  );
}
