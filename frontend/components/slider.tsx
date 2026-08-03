"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { EASE } from "@/lib/motion";

export type Slide = {
  id: string;
  title: string;
  ownerName: string;
  coverUrl: string;
};

const ADVANCE_MS = 5000;

// Landing slideshow: a filmstrip that slides on one transform, auto-advance,
// pause on hover, swipe on touch. Every slide stays mounted so exactly one
// element ever carries data-testid="slider-active". Under reduced motion the
// track snaps instead of sliding — Motion drops the tween, not the position.
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
      <motion.div
        className="flex size-full"
        animate={{ x: `-${index * 100}%` }}
        transition={{ duration: 0.55, ease: EASE.outExpo }}
      >
        {slides.map((slide, i) => (
          <Link
            key={slide.id}
            href={`/projects/${slide.id}`}
            aria-hidden={i !== index}
            tabIndex={i === index ? 0 : -1}
            data-testid={i === index ? "slider-active" : undefined}
            className="relative size-full shrink-0"
          >
            {/* Presigned URL — must not go through the Next image optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slide.coverUrl}
              alt={slide.title}
              className="size-full object-cover"
            />
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 border-t-2 border-border-default-strong bg-ink px-4 py-3 md:px-6 md:py-4">
              <span className="truncate font-display text-lg font-bold text-on-ink md:text-2xl">
                {slide.title}
              </span>
              <span className="shrink-0 border border-safety-yellow px-2 py-0.5 font-mono text-2xs uppercase tracking-[0.1em] text-safety-yellow">
                {slide.ownerName}
              </span>
            </span>
          </Link>
        ))}
      </motion.div>
      {slides.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => step(-1)}
            className="absolute left-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-base border-2 border-border-default-strong bg-menu-bar text-lg text-heading shadow-menu transition-colors duration-120 hover:bg-brand-softer active:shadow-none"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => step(1)}
            className="absolute right-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-base border-2 border-border-default-strong bg-menu-bar text-lg text-heading shadow-menu transition-colors duration-120 hover:bg-brand-softer active:shadow-none"
          >
            ›
          </button>
          <span className="absolute right-3 top-3 rounded-base border-2 border-border-default-strong bg-menu-bar px-2 py-0.5 font-mono text-2xs font-bold tabular-nums text-heading">
            {index + 1}/{slides.length}
          </span>
        </>
      )}
    </div>
  );
}
