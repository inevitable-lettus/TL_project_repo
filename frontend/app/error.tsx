"use client";

import { Button, Window } from "@/components/ui";

export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl pt-12">
      <Window title="SYSTEM_ERROR.LOG" floating>
        <h1 className="u-caps mb-3 text-2xl">Something went wrong</h1>
        <p className="max-w-[65ch] text-base">
          The page hit an unexpected error. Try again — if it keeps happening,
          tell the lab staff.
        </p>
        <Button variant="primary" className="mt-4" onClick={() => reset()}>
          Try again
        </Button>
      </Window>
    </div>
  );
}
