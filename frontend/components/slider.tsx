"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type Slide = {
  id: string;
  title: string;
  ownerName: string;
  coverUrl: string;
};

const ADVANCE_MS = 5000;

// Landing slideshow: crossfade (opacity only), auto-advance, pause on hover,
// swipe on touch. Rendered inside a Window body.
export function Slider({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (paused || slides.length < 2) return;
    const timer = setInterval(
      () => setIndex((i) => (i + 1) % slides.length),
      ADVANCE_MS,
    );
    return () => clearInterval(timer);
  }, [paused, slides.length]);

  const step = (delta: number) =>
    setIndex((i) => (i + delta + slides.length) % slides.length);

  return (
    <div
      data-testid="slider"
      className="relative aspect-[16/9] w-full overflow-hidden sm:aspect-[21/9]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const delta = e.changedTouches[0].clientX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(delta) > 40) step(delta < 0 ? 1 : -1);
      }}
    >
      {slides.map((slide, i) => (
        <Link
          key={slide.id}
          href={`/projects/${slide.id}`}
          aria-hidden={i !== index}
          tabIndex={i === index ? 0 : -1}
          data-testid={i === index ? "slider-active" : undefined}
          className={`absolute inset-0 transition-opacity duration-700 ${
            i === index ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          {/* Presigned URL — must not go through the Next image optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slide.coverUrl}
            alt={slide.title}
            className="size-full object-cover"
          />
          <span className="absolute inset-x-0 bottom-0 flex items-baseline justify-between gap-3 border-t border-border-default bg-menu-bar/95 px-4 py-2.5">
            <span className="truncate font-serif text-lg font-medium text-heading">
              {slide.title}
            </span>
            <span className="shrink-0 font-mono text-[12px] tracking-[0.4px] text-body-subtle">
              {slide.ownerName}
            </span>
          </span>
        </Link>
      ))}
      {slides.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => step(-1)}
            className="absolute left-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-base border border-border-default bg-menu-bar text-heading transition-colors duration-[120ms] hover:bg-neutral-secondary-medium active:shadow-press"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => step(1)}
            className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-base border border-border-default bg-menu-bar text-heading transition-colors duration-[120ms] hover:bg-neutral-secondary-medium active:shadow-press"
          >
            ›
          </button>
          <span className="absolute right-3 top-3 rounded-base border border-border-default bg-menu-bar px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-body-subtle">
            {index + 1}/{slides.length}
          </span>
        </>
      )}
    </div>
  );
}
