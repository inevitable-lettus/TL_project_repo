"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import type { Booking } from "@/lib/types";
import { Badge, Button, buttonClass, SysLabel, Window } from "@/components/ui";

const statusVariant: Record<Booking["status"], "warning" | "success" | "danger" | "gray"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "gray",
};

const hhmm = (t: string) => t.slice(0, 5);

export function MyBookings({ initialBookings }: { initialBookings: Booking[] }) {
  const [bookings, setBookings] = useState(initialBookings);
  const [error, setError] = useState<string | null>(null);

  const cancel = async (booking: Booking) => {
    if (!window.confirm(`Cancel ${booking.machine_slug} on ${booking.date}?`)) return;
    setError(null);
    try {
      const updated = await api.cancelBooking(booking.id);
      setBookings((current) =>
        current.map((b) => (b.id === booking.id ? updated : b)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "cancel failed");
    }
  };

  return (
    <Window
      title={`MY_BOOKINGS.LOG (${bookings.length})`}
      titleBarExtra={
        <Link href="/machines" className={buttonClass("tertiary")}>
          Book a machine
        </Link>
      }
      bodyClassName="flex flex-col gap-3 p-5 md:p-6"
    >
      {bookings.length > 0 ? (
        <ul data-testid="my-bookings" className="flex flex-col divide-y divide-border-default-subtle">
          {bookings.map((booking) => (
            <li key={booking.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-heading">
                  {booking.machine_slug}
                </span>
                <SysLabel>
                  {booking.date} · {hhmm(booking.start_time)}–{hhmm(booking.end_time)}
                </SysLabel>
              </span>
              <Badge variant={statusVariant[booking.status]} mono>
                {booking.status}
              </Badge>
              {(booking.status === "pending" || booking.status === "approved") && (
                <Button variant="tertiary" onClick={() => void cancel(booking)}>
                  Cancel
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[15px] leading-[1.65] text-body-subtle">
          No machine bookings yet — pick a machine and request a slot.
        </p>
      )}
      {error && (
        <p role="alert" className="font-mono text-[12px] text-fg-danger">
          {error}
        </p>
      )}
    </Window>
  );
}
