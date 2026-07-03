import Link from "next/link";
import { Window } from "@/components/ui";

export default function NotFound() {
  return (
    <div data-testid="not-found" className="mx-auto max-w-xl pt-12">
      <Window title="ERROR_404.TXT" floating>
        <h1 className="mb-3">Page not found</h1>
        <p className="max-w-[65ch] text-[15px] leading-[1.65]">
          This page doesn&apos;t exist, or it&apos;s private.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block font-medium text-fg-brand underline hover:no-underline"
        >
          Back to the showcase
        </Link>
      </Window>
    </div>
  );
}
