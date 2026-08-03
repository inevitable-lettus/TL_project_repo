"use client";

import { motion, useScroll, useSpring } from "motion/react";

// Reading progress under the menu bar. Driven by the browser's scroll
// timeline where available, so it costs nothing on the main thread.
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 28 });

  return (
    <motion.div
      aria-hidden
      style={{ scaleX }}
      className="h-0.5 origin-left bg-brand"
    />
  );
}
