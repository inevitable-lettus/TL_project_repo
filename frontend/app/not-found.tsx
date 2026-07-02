import Link from "next/link";

export default function NotFound() {
  return (
    <section data-testid="not-found">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="mt-2 text-neutral-600">
        This page doesn&apos;t exist, or it&apos;s private.
      </p>
      <Link href="/" className="mt-4 inline-block underline">
        Back to the showcase
      </Link>
    </section>
  );
}
