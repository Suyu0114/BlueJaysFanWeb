"use client";

import { AnimatePresence, motion } from "motion/react";
import { DUR, EASE_SOFT, SPRING_TOOLTIP } from "@/lib/motion";

// Shared hover card for the SVG charts (SprayChart / ExitVeloChart /
// PitchMovementChart). Pair with lib/use-lingering-hover.ts: it fades + scales
// in at the first mark, then *springs* to each next mark instead of blinking
// out and reappearing, and fades out once the pointer really leaves.
//
// `left` / `top` are percentages of the chart box (the anchor point); the card
// sits centred above it, `gap` px clear of the mark.
export default function ChartTooltip({
  open,
  left,
  top,
  gap = 8,
  children,
}: {
  open: boolean;
  left: number;
  top: number;
  gap?: number;
  children: React.ReactNode;
}) {
  const pos = { left: `${left}%`, top: `${top}%` };
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="tip"
          className="pointer-events-none absolute z-10 rounded-md border border-navy/20 bg-white px-3 py-2 text-xs shadow-md"
          // Centring via motion's x/y (not Tailwind translate utilities) so it
          // composes with the scale below in one transform.
          style={{ x: "-50%", y: "-100%", originY: 1, marginTop: -gap }}
          // Appear AT the mark (no slide in from wherever it last was)…
          initial={{ opacity: 0, scale: 0.94, ...pos }}
          // …then spring between marks while open.
          animate={{ opacity: 1, scale: 1, ...pos }}
          exit={{ opacity: 0, scale: 0.94 }}
          transition={{
            left: SPRING_TOOLTIP,
            top: SPRING_TOOLTIP,
            default: { duration: DUR.hover, ease: EASE_SOFT },
          }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
