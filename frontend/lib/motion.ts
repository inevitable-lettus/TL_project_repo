import type { Transition, Variants } from "motion/react";

// Single source for motion values. Import these instead of writing inline
// transitions, so timing stays consistent the way the colour tokens do.

export const DUR = { fast: 0.12, base: 0.22, slow: 0.38 } as const;

export const EASE = {
  outExpo: [0.16, 1, 0.3, 1],
  outQuart: [0.25, 1, 0.5, 1],
} as const;

export const transition: Transition = {
  duration: DUR.slow,
  ease: EASE.outExpo,
};

// Scroll/mount entrance. Under MotionConfig reducedMotion="user" the y is
// dropped automatically and only the opacity runs.
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition },
};

export const staggerParent: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};

// Reveal once, as the element enters. `amount` must stay "some": a ratio
// threshold can never be met by an element taller than viewport/ratio — a long
// project write-up would sit at opacity 0 forever. The negative bottom margin
// is what delays the trigger instead, independent of element height.
export const revealOnce = {
  initial: "hidden",
  whileInView: "visible",
  viewport: { once: true, amount: "some", margin: "0px 0px -80px 0px" },
} as const;

// The identity's signature press: hover lifts the element off its hard
// shadow, tap drops it back down into the shadow.
export const pressHard = {
  whileHover: { x: -2, y: -2 },
  whileTap: { x: 0, y: 0 },
  transition: { duration: DUR.fast, ease: EASE.outQuart },
} as const;
