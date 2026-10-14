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
import type { Loan } from "@/lib/types";
import {
  uploadErrorMessage,
  uploadLoanPhoto,
  type UploadState,
} from "@/lib/upload";
import { PhotoPicker } from "./photo-picker";

// inputClass is 36px high; tap targets on this phone-first page are 44px.
const fieldClass = `${inputClass} min-h-11`;

function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

// One submit attempt: upload the photo, then call the API. The photo id and
// the client-generated id are kept across failures so a retry neither uploads
// again nor creates a second record; `reset` forgets them after success or
// when the photo changes.
function useAttempt() {
  const [state, setState] = useState<UploadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const photoId = useRef<string | null>(null);
  const attemptId = useRef<string | null>(null);

  const run = async (
    photo: File,
    act: (photoFileId: string, attemptId: string) => Promise<void>,
  ): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      photoId.current ??= (await uploadLoanPhoto(photo, setState)).id;
      setState(null);
      attemptId.current ??= crypto.randomUUID();
      await act(photoId.current, attemptId.current);
      photoId.current = null;
      attemptId.current = null;
      return true;
    } catch (caught) {
      setError(uploadErrorMessage(caught));
      return false;
    } finally {
      setState(null);
      setBusy(false);
    }
  };

  const forgetPhoto = () => {
    photoId.current = null;
  };

  return { state, error, busy, run, forgetPhoto };
}

function BorrowForm({ onCreated }: { onCreated: (loan: Loan) => void }) {
  const attempt = useAttempt();
  const [photo, setPhoto] = useState<File | null>(null);
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [dueDate, setDueDate] = useState("");
  const [reason, setReason] = useState("");
  const [today] = useState(localToday);
  const [pickerKey, setPickerKey] = useState(0);
  const [confirmed, setConfirmed] = useState<string | null>(null);

  const ready =
    photo &&
    itemName.trim() &&
    Number(quantity) >= 1 &&
    dueDate &&
    reason.trim();

  const submit = async () => {
    if (!photo) return;
    setConfirmed(null);
    // loan_id is the attempt id: the same value is sent on every retry.
    const ok = await attempt.run(photo, async (photoFileId, loanId) => {
      const loan = await api.createLoan({
        loan_id: loanId,
        item_name: itemName.trim(),
        quantity: Number(quantity),
        due_date: dueDate,
        reason: reason.trim(),
        photo_file_id: photoFileId,
      });
      onCreated(loan);
      setConfirmed(`${loan.item_name} logged`);
    });
    if (ok) {
      setPhoto(null);
      setPickerKey((key) => key + 1);
      setItemName("");
      setQuantity("1");
      setDueDate("");
      setReason("");
    }
  };

  return (
    <Window
      title="BORROW.LOG"
      floating
      bodyClassName="flex flex-col gap-4 p-5 md:p-6"
    >
      <div>
        <h1 className="u-caps text-2xl">Borrow materials</h1>
        <p className="mt-1 text-sm text-body-subtle">
          Snap the item, say when it is coming back. Staff see it in the lab
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
        <PhotoPicker
          key={pickerKey}
          testId="borrow-photo-input"
          disabled={attempt.busy}
          onChange={(file) => {
            attempt.forgetPhoto();
            setPhoto(file);
          }}
        />
        <Field id="borrow-item" label="Item">
          <input
            id="borrow-item"
            className={fieldClass}
            value={itemName}
            maxLength={120}
            placeholder="e.g. Soldering iron"
            onChange={(event) => setItemName(event.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="borrow-quantity" label="Quantity">
            <input
              id="borrow-quantity"
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              className={fieldClass}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </Field>
          <Field id="borrow-due" label="Return by">
            <input
              id="borrow-due"
              type="date"
              min={today}
              suppressHydrationWarning // server and browser dates can differ
              className={fieldClass}
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </Field>
        </div>
        <Field id="borrow-reason" label="Reason">
          <textarea
            id="borrow-reason"
            className={fieldClass}
            rows={3}
            maxLength={500}
            placeholder="What is it for?"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <UploadMeter state={attempt.state} error={attempt.error} />
        <Button
          type="submit"
          size="lg"
          className="min-h-11"
          disabled={attempt.busy || !ready}
        >
          {attempt.busy ? "Submitting…" : "Borrow"}
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
  onReturned: () => Promise<void>;
}) {
  const attempt = useAttempt();
  const [photo, setPhoto] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const noteId = `return-note-${loan.loan_id}`;

  const submit = async () => {
    if (!photo) return;
    await attempt.run(photo, async (photoFileId) => {
      try {
        await api.returnLoan(loan.loan_id, {
          photo_file_id: photoFileId,
          condition_note: note.trim(),
        });
      } catch (error) {
        // An earlier try already returned it and only the refetch failed.
        if (!(error instanceof ApiError && error.status === 409)) throw error;
      }
      await onReturned();
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
            attempt.forgetPhoto();
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

function PhotoLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${buttonClass("tertiary")} min-h-11`}
    >
      {children}
    </a>
  );
}

function OpenLoan({
  loan,
  onReturned,
}: {
  loan: Loan;
  onReturned: () => Promise<void>;
}) {
  const [returning, setReturning] = useState(false);
  return (
    <li
      data-testid="open-loan"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-default-subtle px-2 py-3 last:border-b-0"
    >
      <span className="min-w-full flex-1 sm:min-w-0">
        <span className="block break-words text-base font-medium text-heading">
          {loan.item_name}
          {loan.quantity > 1 && ` × ${loan.quantity}`}
        </span>
        <SysLabel>Due {loan.due_date}</SysLabel>
      </span>
      {loan.overdue && (
        <Badge variant="danger" mono>
          overdue
        </Badge>
      )}
      <span className="flex gap-2">
        <PhotoLink href={loan.borrow_photo_url}>View photo</PhotoLink>
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
          <li
            key={loan.loan_id}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-default-subtle px-2 py-3 last:border-b-0"
          >
            <span className="min-w-full flex-1 sm:min-w-0">
              <span className="block break-words text-base text-heading">
                {loan.item_name}
                {loan.quantity > 1 && ` × ${loan.quantity}`}
              </span>
              <SysLabel>
                Returned {loan.returned_at && formatDate(loan.returned_at)}
              </SysLabel>
              {loan.return_note && (
                <span className="mt-0.5 block text-sm text-body-subtle">
                  {loan.return_note}
                </span>
              )}
            </span>
            <span className="flex gap-2">
              <PhotoLink href={loan.borrow_photo_url}>Borrow photo</PhotoLink>
              {loan.return_photo_url && (
                <PhotoLink href={loan.return_photo_url}>Return photo</PhotoLink>
              )}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function BorrowClient({
  initialLoans,
}: {
  initialLoans: Loan[] | null;
}) {
  const [loans, setLoans] = useState(initialLoans ?? []);

  if (initialLoans === null) {
    return (
      <div className="mx-auto w-full max-w-[560px]">
        <Window title="BORROW.LOG" floating bodyClassName="p-5 md:p-6">
          <h1 className="u-caps text-2xl">Borrowing isn&apos;t set up yet</h1>
          <p
            data-testid="borrow-not-configured"
            className="mt-2 text-base text-body-subtle"
          >
            Ask lab staff to turn it on. Everything else on the site works as
            usual.
          </p>
        </Window>
      </div>
    );
  }

  const open = loans
    .filter((loan) => loan.status === "out")
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const returned = loans.filter((loan) => loan.status === "returned");

  const refresh = async () => setLoans(await api.myLoans());

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-8">
      <BorrowForm
        onCreated={(loan) => setLoans((current) => [loan, ...current])}
      />
      <Window title="ON_LOAN" bodyClassName="p-3 md:p-4">
        {open.length > 0 ? (
          <ul data-testid="open-loans" className="flex flex-col">
            {open.map((loan) => (
              <OpenLoan key={loan.loan_id} loan={loan} onReturned={refresh} />
            ))}
          </ul>
        ) : (
          <p className="p-3 text-base text-body-subtle">
            Nothing on loan right now.
          </p>
        )}
        {returned.length > 0 && <ReturnedLoans loans={returned} />}
      </Window>
    </div>
  );
}
