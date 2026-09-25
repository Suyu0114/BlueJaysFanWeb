"use client";

import { useLayoutEffect, useRef } from "react";
import { animate, useInView, useReducedMotion } from "motion/react";
import { EASE_SOFT } from "@/lib/motion";

// KPI number that rolls up from 0 when it scrolls into view. Props are plain
// values (no formatter function) so server components can render it.
//
// The final value is server-rendered (SEO / no-JS) and duplicated in an sr-only
// span; the visible digits are aria-hidden so screen readers don't hear the
// intermediate frames. Only use this for plain decimals — NOT innings pitched,
// whose .1/.2 thirds notation has no valid in-between values.
export default function CountUp({
  value,
  digits,
  scale = 1,
  suffix = "",
}: {
  value: number;
  digits: number;
  scale?: number; // e.g. 100 for a stored fraction shown as a percent
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const shown = value * scale;
  const format = (v: number) => `${v.toFixed(digits)}${suffix}`;
  const final = format(shown);

  // Park the digits at 0 before first paint (the wrapper is still hidden by
  // its Reveal at this point, so there's no visible jump from final → 0).
  useLayoutEffect(() => {
    if (ref.current && !inView && !reduce) ref.current.textContent = format(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (!inView || !ref.current) return;
    const el = ref.current;
    if (reduce) {
      el.textContent = final;
      return;
    }
    const controls = animate(0, shown, {
      duration: 1.1,
      ease: EASE_SOFT,
      onUpdate: (v) => {
        el.textContent = format(v);
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, shown, reduce]);

  return (
    <>
      <span ref={ref} aria-hidden>
        {final}
      </span>
      <span className="sr-only">{final}</span>
    </>
  );
}
