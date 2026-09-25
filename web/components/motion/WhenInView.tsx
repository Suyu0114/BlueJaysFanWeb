"use client";

import { useRef } from "react";
import { useInView } from "motion/react";

// Defers mounting `children` until this box scrolls into view. For Recharts:
// its line-draw / bar-grow animation runs on mount, so mounting on arrival
// makes the reader actually see it instead of it finishing off-screen. Give
// the box a fixed height (it IS the chart's sizing container) so nothing
// shifts when the chart appears.
export default function WhenInView({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  return (
    <div ref={ref} className={className}>
      {inView ? children : null}
    </div>
  );
}
