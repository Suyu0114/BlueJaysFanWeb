"use client";

import { MotionConfig } from "motion/react";
import { EASE_SOFT } from "@/lib/motion";

// Site-wide motion defaults. reducedMotion="user" makes every motion component
// honour the OS "reduce motion" setting (transforms/layout snap, opacity still
// fades); the CSS keyframes in globals.css have their own media query.
export default function MotionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MotionConfig reducedMotion="user" transition={{ ease: EASE_SOFT }}>
      {children}
    </MotionConfig>
  );
}
