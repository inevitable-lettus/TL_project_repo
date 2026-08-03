"use client";

import { MotionConfig } from "motion/react";

// reducedMotion="user" makes every motion component drop transform and layout
// animation when the visitor asks for reduced motion, while still animating
// opacity — so nothing is left stuck invisible at opacity 0.
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
