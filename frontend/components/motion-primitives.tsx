"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { fadeUp, revealOnce, staggerParent } from "@/lib/motion";

// Client wrappers so server components can opt into motion without becoming
// client components themselves. `data-reveal` lets the no-JS stylesheet in the
// root layout force these visible — content must never depend on hydration.

export function RevealSection({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.section
      data-reveal
      className={className}
      variants={fadeUp}
      {...revealOnce}
    >
      {children}
    </motion.section>
  );
}

// Parent/child pair: children animate in sequence rather than together.
// Never nest this inside a revealing Window — the outer variant state wins and
// the inner children stay at opacity 0. Pass reveal={false} to the Window.
export function Stagger({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      data-reveal
      className={className}
      variants={staggerParent}
      {...revealOnce}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.div data-reveal className={className} variants={fadeUp}>
      {children}
    </motion.div>
  );
}
