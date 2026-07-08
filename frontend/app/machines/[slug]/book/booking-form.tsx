"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { BookingRules, DaySlot, Machine } from "@/lib/types";
import { Badge, Button, buttonClass, Field, inputClass, SysLabel, Window } from "@/components/ui";

const toMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const toLabel = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

export function BookingForm({
  machine,
  rules,
}: {
  machine: Machine;
  rules: BookingRules;
}) {
  const open = toMin(rules.lab_open);
  const close = toMin(rules.lab_close);
  const slot = rules.slot_minutes;

  const today = new Date();
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + rules.advance_days);

  const [date, setDate] = useState(isoDate(today));
  const [day, setDay] = useState<{ date: string; slots: DaySlot[] } | null>(null);
  const [start, setStart] = useState<number | null>(null);
  const [duration, setDuration] = useState(slot);
  const [purpose, setPurpose] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.bookingDay(machine.slug, date).then((slots) => {
      if (!cancelled) {
        setDay({ date, slots });
        setStart(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [machine.slug, date]);

  // Only trust slots fetched for the currently selected date.
  const busy = day?.date === date ? day.slots : null;
  const busyRanges = (busy ?? []).map((b) => [toMin(b.start_time), toMin(b.end_time)] as const);
  const blocked = (from: number, to: number) =>
    to > close || busyRanges.some(([bStart, bEnd]) => from < bEnd && to > bStart);

  const starts: number[] = [];
  for (let t = open; t + slot <= close; t += slot) starts.push(t);

  const durations: number[] = [];
  for (let d = slot; d <= rules.max_minutes && d <= close - open; d += slot) {
    durations.push(d);
  }

  const submit = async () => {
    if (start === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createBooking({
        machine_slug: machine.slug,
        date,
        start_time: toLabel(start),
        end_time: toLabel(start + duration),
        purpose: purpose.trim(),
      });
      setBooked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "booking failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (booked) {
    return (
      <div className="mx-auto w-full max-w-[560px]">
        <Window title="BOOKING.REQ" floating bodyClassName="flex flex-col gap-4 p-6 md:p-8">
          <Badge variant="warning" mono>
            pending
          </Badge>
          <h1 className="text-[26px] md:text-[32px]">Request sent</h1>
          <p className="text-[15px] leading-[1.65] text-body">
            {machine.name} on {date}, {toLabel(start!)}–{toLabel(start! + duration)}.
            Lab staff review every booking — track it from your dashboard.
          </p>
          <div className="flex gap-3">
            <Link href="/dashboard" className={buttonClass("primary")}>
              My bookings
            </Link>
            <Link href="/machines" className={buttonClass("tertiary")}>
              Back to machines
            </Link>
          </div>
        </Window>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <Window
        title={`BOOK.${machine.slug.toUpperCase().replaceAll("-", "_")}`}
        floating
        bodyClassName="flex flex-col gap-5 p-6 md:p-8"
      >
        <div>
          <h1 className="text-[26px] md:text-[32px]">{machine.name}</h1>
          <p className="mt-1 text-[13px] text-body-subtle">
            Lab hours {toLabel(open)}–{toLabel(close)} · up to{" "}
            {rules.max_minutes / 60}h per booking · staff approve requests.
          </p>
        </div>

        <Field id="booking-date" label="Date">
          <input
            id="booking-date"
            type="date"
            className={inputClass}
            value={date}
            min={isoDate(today)}
            max={isoDate(maxDate)}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>

        <Field id="booking-duration" label="Duration">
          <select
            id="booking-duration"
            className={inputClass}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          >
            {durations.map((d) => (
              <option key={d} value={d}>
                {d / 60} hour{d > 60 ? "s" : ""}
              </option>
            ))}
          </select>
        </Field>

        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-heading">
            Start time
          </span>
          {busy === null ? (
            <SysLabel>LOADING_SLOTS…</SysLabel>
          ) : (
            <div data-testid="slot-grid" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {starts.map((t) => {
                const taken = blocked(t, t + duration);
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={taken}
                    aria-pressed={start === t}
                    data-testid={`slot-${toLabel(t)}`}
                    onClick={() => setStart(t)}
                    className={`rounded-base border px-2 py-2 font-mono text-[12px] tracking-[0.4px] transition-colors duration-[120ms] active:shadow-press disabled:cursor-not-allowed disabled:border-border-default-subtle disabled:bg-disabled disabled:text-fg-disabled ${
                      start === t
                        ? "border-border-brand bg-brand-softer text-fg-brand-strong shadow-press"
                        : "border-border-default bg-neutral-primary-soft text-heading hover:bg-neutral-secondary-medium"
                    }`}
                  >
                    {toLabel(t)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <Field id="booking-purpose" label="What are you making?">
          <input
            id="booking-purpose"
            className={inputClass}
            value={purpose}
            maxLength={500}
            placeholder="e.g. acrylic enclosure for the rover"
            onChange={(e) => setPurpose(e.target.value)}
          />
        </Field>

        {error && (
          <p role="alert" className="font-mono text-[12px] text-fg-danger">
            {error}
          </p>
        )}

        <Button
          data-testid="submit-booking"
          disabled={start === null || !purpose.trim() || submitting}
          onClick={() => void submit()}
        >
          Request booking
        </Button>
      </Window>
    </div>
  );
}
