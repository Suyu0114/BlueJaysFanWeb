// Shared motion vocabulary — every animated component pulls its timing from
// here so the site moves with one rhythm instead of a dozen hand-tuned ones.
// The CSS side (hover colour transitions, ink / dot keyframes) mirrors these
// values in app/globals.css (--ease-soft, --default-transition-duration).
import type { Transition } from "motion/react";

/** ease-out-quint: quick to respond, long soft settle. Same curve as --ease-soft. */
export const EASE_SOFT = [0.22, 1, 0.36, 1] as const;

/** Durations in seconds. */
export const DUR = {
  hover: 0.3,
  enter: 0.6,
  exit: 0.2,
  ink: 0.9,
} as const;

/** Delay between siblings in a staggered reveal. */
export const STAGGER = 0.06;

/** Card hover lift — soft, slightly under-damped so it settles like paper. */
export const SPRING_SOFT: Transition = {
  type: "spring",
  stiffness: 220,
  damping: 22,
};

/** Chart tooltip following the pointer between marks — firm, no overshoot. */
export const SPRING_TOOLTIP: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 32,
};

/** Standard fade-and-rise used by Reveal and the tab/panel swaps. */
export const ENTER: Transition = { duration: DUR.enter, ease: EASE_SOFT };
