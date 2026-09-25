"use client";

import { motion } from "motion/react";
import { SPRING_SOFT } from "@/lib/motion";

// The active highlight of a segmented toggle. Render it inside whichever option
// is active (that option needs `relative`, its label `relative z-10`); motion's
// shared-layout `layoutId` then slides the one highlight from the old option to
// the new one instead of the colour blinking across. `group` must be unique per
// toggle on the page. `className` sets placement + colour (default: fill the
// option in brick; PlayerNav passes a 2px bottom rule instead).
export default function SlidingPill({
  group,
  className = "inset-0 bg-brick",
}: {
  group: string;
  className?: string;
}) {
  return (
    <motion.span
      layoutId={group}
      aria-hidden
      className={`absolute ${className}`}
      transition={SPRING_SOFT}
    />
  );
}
