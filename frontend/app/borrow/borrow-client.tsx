"use client";

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
  Window,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { Loan, LoanRules, LoanType } from "@/lib/types";
import {
  uploadErrorMessage,
  uploadLoanPhoto,
  type UploadState,
} from "@/lib/upload";
import { dropPhotos, PhotoGrid, type PickedPhoto } from "./photo-grid";
import { PhotoPicker } from "./photo-picker";

// inputClass is 36px high; tap targets on this phone-first page are 44px.
const fieldClass = `${inputClass} min-h-11`;

type ProjectOption = { id: string; title: string };
type Photo = { key: string; file: File };

function localDate(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function amount(loan: Loan): string {
  return `${loan.quantity} ${loan.unit}`;
}

// One submit attempt: upload the photos, then call the API. Uploaded photo
// ids (per picked photo) and the client-generated id survive a failure, so a
// retry neither uploads again nor creates a second record. A second submit
// while one is in flight is ignored.
function useAttempt() {
  const [state, setState] = useState<UploadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const uploaded = useRef(new Map<string, string>());
  const attemptId = useRef<string | null>(null);

  const run = async (
    photos: Photo[],
    act: (photoFileIds: string[], attemptId: string) => Promise<void>,
  ): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const ids: string[] = [];
      for (const photo of photos) {
        let id = uploaded.current.get(photo.key);
        if (!id) {
          id = (await uploadLoanPhoto(photo.file, setState)).id;
          uploaded.current.set(photo.key, id);
        }
        ids.push(id);
      }
      setState(null);
      attemptId.current ??= crypto.randomUUID();
      await act(ids, attemptId.current);
      uploaded.current.clear();
      attemptId.current = null;
      return true;
    } catch (caught) {
      setError(uploadErrorMessage(caught));
      return false;
    } finally {
      setState(null);
      setBusy(false);
      inFlight.current = false;
    }
  };

  const forgetPhoto = (key: string) => {
    uploaded.current.delete(key);
  };

  // An edit after a failure makes the next submit a new loan, not a retry: if
  // the failed attempt did land, reusing its id would silently return that
  // loan and drop the edit. Its photos may already be linked to it, so they
  // upload again too (an unlinked leftover is swept by the cleanup job).
  const restart = () => {
    attemptId.current = null;
    uploaded.current.clear();
  };

  return { state, error, busy, run, forgetPhoto, restart };
}

function TypeToggle({
  value,
  disabled,
  onChange,
}: {
  value: LoanType;
  disabled: boolean;
  onChange: (type: LoanType) => void;
}) {
  const options: [LoanType, string][] = [
    ["equipment", "Equipment"],
    ["material", "Material"],
  ];
  return (
    <fieldset>
      <legend className="mb-1.5 block font-display text-sm font-semibold text-heading">
        Type
      </legend>
      <div className="grid grid-cols-2 gap-3">
        {options.map(([type, label]) => (
          <Button
            key={type}
            type="button"
            variant={value === type ? "primary" : "tertiary"}
            className="min-h-11"
            aria-pressed={value === type}
            disabled={disabled}
            onClick={() => onChange(type)}
          >
            {label}
          </Button>
        ))}
      </div>
      <p className="mt-1.5 text-sm text-body-subtle">
        {value === "equipment"
          ? "Comes back to the lab: pick a return date."
          : "Used up (filament, sheet, wire): no return."}
      </p>
    </fieldset>
  );
}

function BorrowForm({
  rules,
  projects,
  onCreated,
}: {
  rules: LoanRules;
  projects: ProjectOption[];
  onCreated: (loan: Loan) => void;
}) {
  const attempt = useAttempt();
  const [type, setType] = useState<LoanType>("equipment");
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState(rules.units[0]);
  const [projectId, setProjectId] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [today] = useState(() => localDate());
  const [lastDay] = useState(() => localDate(rules.max_days));
  const [confirmed, setConfirmed] = useState<string | null>(null);

  // Every field change goes through `edit`, so a retry is only ever a retry
  // of exactly what was submitted.
  const edit =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      attempt.restart();
      setter(value);
    };

  const equipment = type === "equipment";
  const ready =
    photos.length > 0 &&
    itemName.trim() &&
    Number(quantity) >= 1 &&
    description.trim() &&
    (!equipment || dueDate);

  const submit = async () => {
    setConfirmed(null);
    // The loan id is the attempt id: the same value is sent on every retry.
    const ok = await attempt.run(photos, async (photoFileIds, loanId) => {
      const loan = await api.createLoan({
        id: loanId,
        type,
        item_name: itemName.trim(),
        description: description.trim(),
        quantity: Number(quantity),
        unit,
        project_id: projectId || null,
        due_date: equipment ? dueDate : null,
        photo_file_ids: photoFileIds,
      });
      onCreated(loan);
      setConfirmed(`${loan.item_name} logged`);
    });
    if (ok) {
      dropPhotos(photos);
      setPhotos([]);
      setItemName("");
      setQuantity("1");
      setUnit(rules.units[0]);
      setProjectId("");
      setDescription("");
      setDueDate("");
    }
  };

  return (
    <Window
      title="BORROW.LOG"
      floating
      bodyClassName="flex flex-col gap-4 p-5 md:p-6"
    >
      <div>
        <h1 className="u-caps text-2xl">Borrow from the lab</h1>
        <p className="mt-1 text-sm text-body-subtle">
          Snap what you take and say what it is for. Staff see it in the lab
          log.
        </p>
      </div>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <TypeToggle
          value={type}
          disabled={attempt.busy}
          onChange={edit(setType)}
        />
        <div>
          <SysLabel>Photos</SysLabel>
          <div className="mt-1.5">
            <PhotoGrid
              photos={photos}
              max={rules.max_photos}
              disabled={attempt.busy}
              onAdd={(photo) => {
                attempt.restart();
                setPhotos((current) => [...current, photo]);
              }}
              onRemove={(photo) => {
                attempt.restart();
                dropPhotos([photo]);
                setPhotos((current) =>
                  current.filter((other) => other.key !== photo.key),
                );
              }}
            />
          </div>
        </div>
        <Field id="borrow-item" label="Item">
          <input
            id="borrow-item"
            className={fieldClass}
            value={itemName}
            maxLength={120}
            placeholder={
              equipment ? "e.g. Soldering iron" : "e.g. PLA filament"
            }
            onChange={(event) => edit(setItemName)(event.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="borrow-quantity" label="Quantity">
            <input
              id="borrow-quantity"
              type="number"
              inputMode="numeric"
              min={1}
              max={99999}
              className={fieldClass}
              value={quantity}
              onChange={(event) => edit(setQuantity)(event.target.value)}
            />
          </Field>
          <Field id="borrow-unit" label="Unit">
            <select
              id="borrow-unit"
              className={fieldClass}
              value={unit}
              onChange={(event) => edit(setUnit)(event.target.value)}
            >
              {rules.units.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field id="borrow-project" label="Project">
          <select
            id="borrow-project"
            className={fieldClass}
            value={projectId}
            onChange={(event) => edit(setProjectId)(event.target.value)}
          >
            <option value="">Not for a listed project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </Field>
        <Field id="borrow-description" label="Description">
          <textarea
            id="borrow-description"
            className={fieldClass}
            rows={3}
            maxLength={500}
            placeholder="What it is and what it is for"
            value={description}
            onChange={(event) => edit(setDescription)(event.target.value)}
          />
        </Field>
        {equipment && (
          <Field id="borrow-due" label="Return by">
            <input
              id="borrow-due"
              type="date"
              min={today}
              max={lastDay}
              suppressHydrationWarning // server and browser dates can differ
              className={fieldClass}
              value={dueDate}
              onChange={(event) => edit(setDueDate)(event.target.value)}
            />
          </Field>
        )}
        <UploadMeter state={attempt.state} error={attempt.error} />
        <Button
          type="submit"
          size="lg"
          className="min-h-11"
          disabled={attempt.busy || !ready}
        >
          {attempt.busy ? "Submitting…" : equipment ? "Borrow" : "Log material"}
        </Button>
        {confirmed && (
          <p
            role="status"
            data-testid="borrow-confirmation"
            className="font-mono text-xs font-bold text-fg-success"
          >
            {confirmed}
          </p>
        )}
      </form>
    </Window>
  );
}

function ReturnForm({
  loan,
  onReturned,
}: {
  loan: Loan;
  onReturned: (loan: Loan | null) => Promise<void>;
}) {
  const attempt = useAttempt();
  const [photo, setPhoto] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const noteId = `return-note-${loan.id}`;

  const submit = async () => {
    if (!photo) return;
    await attempt.run([{ key: "return", file: photo }], async ([photoId]) => {
      let returned: Loan | null = null;
      try {
        returned = await api.returnLoan(loan.id, {
          photo_file_id: photoId,
          note: note.trim(),
        });
      } catch (error) {
        // An earlier try already returned it; only its response was lost.
        if (!(error instanceof ApiError && error.status === 409)) throw error;
      }
      await onReturned(returned);
    });
  };

  return (
    <Panel inset className="mt-3 w-full p-3">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <SysLabel>Photo of its condition</SysLabel>
        <PhotoPicker
          testId="return-photo-input"
          disabled={attempt.busy}
          onChange={(file) => {
            attempt.forgetPhoto("return");
            setPhoto(file);
          }}
        />
        <Field id={noteId} label="Condition note (optional)">
          <textarea
            id={noteId}
            className={fieldClass}
            rows={2}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        <UploadMeter state={attempt.state} error={attempt.error} />
        <Button
          type="submit"
          className="min-h-11"
          disabled={attempt.busy || !photo}
        >
          {attempt.busy ? "Submitting…" : "Confirm return"}
        </Button>
      </form>
    </Panel>
  );
}

function PhotoLinks({ ids, label }: { ids: string[]; label: string }) {
  return ids.map((id, index) => (
    <a
      key={id}
      href={`/loans/photo/${id}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`${buttonClass("tertiary")} min-h-11`}
    >
      {ids.length > 1 ? `${label} ${index + 1}` : label}
    </a>
  ));
}

const rowClass =
  "flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-default-subtle px-2 py-3 last:border-b-0";

function LoanSummary({ loan, meta }: { loan: Loan; meta: string }) {
  return (
    <span className="min-w-full flex-1 sm:min-w-0">
      <span className="block break-words text-base font-medium text-heading">
        {loan.item_name} × {amount(loan)}
      </span>
      <SysLabel>{meta}</SysLabel>
      {loan.project && (
        <span className="mt-0.5 block break-words text-sm text-body-subtle">
          For {loan.project.title}
        </span>
      )}
    </span>
  );
}

function OpenLoan({
  loan,
  onReturned,
}: {
  loan: Loan;
  onReturned: (loan: Loan | null) => Promise<void>;
}) {
  const [returning, setReturning] = useState(false);
  return (
    <li data-testid="open-loan" className={rowClass}>
      <LoanSummary loan={loan} meta={`Due ${loan.due_date}`} />
      {loan.status === "overdue" && (
        <Badge variant="danger" mono>
          overdue
        </Badge>
      )}
      <span className="flex flex-wrap gap-2">
        <PhotoLinks ids={loan.borrow_photo_ids} label="Photo" />
        <Button
          type="button"
          className="min-h-11"
          aria-expanded={returning}
          onClick={() => setReturning((open) => !open)}
        >
          {returning ? "Cancel" : "Return"}
        </Button>
      </span>
      {returning && <ReturnForm loan={loan} onReturned={onReturned} />}
    </li>
  );
}

function ReturnedLoans({ loans }: { loans: Loan[] }) {
  return (
    <details
      data-testid="returned-loans"
      className="mt-4 border-t border-border-default-subtle pt-1"
    >
      <summary className="cursor-pointer py-3.5 font-mono text-xs uppercase tracking-[0.1em] text-body-subtle">
        Returned ({loans.length})
      </summary>
      <ul className="flex flex-col">
        {loans.map((loan) => (
          <li key={loan.id} className={rowClass}>
            <LoanSummary
              loan={loan}
              meta={`Returned ${loan.returned_at ? formatDate(loan.returned_at) : ""}`}
            />
            {loan.return_note && (
              <span className="min-w-full text-sm text-body-subtle">
                {loan.return_note}
              </span>
            )}
            <span className="flex flex-wrap gap-2">
              <PhotoLinks ids={loan.borrow_photo_ids} label="Borrow photo" />
              {loan.return_photo_id && (
                <PhotoLinks ids={[loan.return_photo_id]} label="Return photo" />
              )}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function UsedLog({ loans }: { loans: Loan[] }) {
  return (
    <Window title="USED.LOG" bodyClassName="p-3 md:p-4">
      {loans.length > 0 ? (
        <ul data-testid="used-loans" className="flex flex-col">
          {loans.map((loan) => (
            <li key={loan.id} className={rowClass}>
              <LoanSummary
                loan={loan}
                meta={`Logged ${formatDate(loan.borrowed_at)}`}
              />
              <Badge variant="gray" mono>
                {loan.status}
              </Badge>
              <span className="flex flex-wrap gap-2">
                <PhotoLinks ids={loan.borrow_photo_ids} label="Photo" />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-3 text-base text-body-subtle">
          No materials logged yet.
        </p>
      )}
    </Window>
  );
}

export function BorrowClient({
  initialLoans,
  rules,
  projects,
}: {
  initialLoans: Loan[];
  rules: LoanRules;
  projects: ProjectOption[];
}) {
  const [loans, setLoans] = useState(initialLoans);

  const open = loans
    .filter((loan) => loan.status === "out" || loan.status === "overdue")
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  const used = loans.filter((loan) => loan.status === "used");
  const returned = loans
    .filter((loan) => loan.status === "returned")
    .sort((a, b) => (b.returned_at ?? "").localeCompare(a.returned_at ?? ""));

  const onReturned = async (loan: Loan | null) => {
    if (loan) {
      setLoans((current) =>
        current.map((other) => (other.id === loan.id ? loan : other)),
      );
    } else {
      setLoans(await api.myLoans());
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-8">
      <BorrowForm
        rules={rules}
        projects={projects}
        onCreated={(loan) =>
          setLoans((current) => [
            loan,
            ...current.filter((other) => other.id !== loan.id),
          ])
        }
      />
      <Window title="ON_LOAN" bodyClassName="p-3 md:p-4">
        {open.length > 0 ? (
          <ul data-testid="open-loans" className="flex flex-col">
            {open.map((loan) => (
              <OpenLoan key={loan.id} loan={loan} onReturned={onReturned} />
            ))}
          </ul>
        ) : (
          <p className="p-3 text-base text-body-subtle">
            Nothing on loan right now.
          </p>
        )}
        {returned.length > 0 && <ReturnedLoans loans={returned} />}
      </Window>
      <UsedLog loans={used} />
    </div>
  );
}
