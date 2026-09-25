"use client";

import { useLayoutEffect, useRef } from "react";
import { motion, useInView } from "motion/react";
import rough from "roughjs";
import { inkify } from "@/lib/ink-draw";
import { DUR, EASE_SOFT, SPRING_SOFT } from "@/lib/motion";

// Shared hand-drawn "scorecard" surface. The home hero cards and the roster
// cards both wrap their content in this so the site reads as one set of
// hand-drawn parchment cards (the schedule calendar uses the same look with its
// own overlay). rough.js needs literal colors — these mirror the @theme tokens.
const NAVY = "#003049";
const INK_FAINT = "rgba(0, 48, 73, 0.28)"; // faint navy inner rule

// Offset "print" shadow. Written in motion's own order (offsets, then colour)
// so the hover can interpolate it; #00304933 / #00304940 as rgba.
const SHADOW_REST = "5px 5px 0px 0px rgba(0, 48, 73, 0.2)";
const SHADOW_LIFT = "8px 8px 0px 0px rgba(0, 48, 73, 0.25)";

// Stable per-card seed so the wobble doesn't shimmer on resize.
function seedFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 100000;
}

export default function ScorecardFrame({
  seedKey,
  variant = "card",
  className,
  children,
}: {
  seedKey: string;
  // "card"    = double-line frame + offset shadow + hover lift (hero / roster cards).
  // "panel"   = same frame + shadow, NO hover lift — for content that isn't
  //             clickable (the standings tables); lifting would signal an
  //             affordance that isn't there.
  // "control" = single tighter line, no shadow/hover (segmented toggles).
  variant?: "card" | "panel" | "control";
  className?: string;
  children: React.ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const seed = seedFromString(seedKey);
  // The frame sketches itself in (lib/ink-draw.ts) the first time it scrolls
  // into view. After that, redraws (ResizeObserver) paint instantly — a resize
  // shouldn't replay the pen.
  const inView = useInView(boxRef, { once: true, amount: 0.25 });
  const inkedRef = useRef(false);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const svg = svgRef.current;
    if (!box || !svg) return;

    let raf = 0;
    // ResizeObserver fires once on observe() — a frame AFTER the first draw.
    // Redrawing then would wipe the ink animation that draw just started, so
    // only repaint when the size actually changed.
    let lastW = -1;
    let lastH = -1;
    const draw = () => {
      const w = box.clientWidth;
      const h = box.clientHeight;
      if (w === 0 || h === 0) return;
      if (w === lastW && h === lastH) return;
      lastW = w;
      lastH = h;
      svg.setAttribute("width", String(w));
      svg.setAttribute("height", String(h));
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const rc = rough.svg(svg);
      const layers: SVGGElement[] = [];

      if (variant === "control") {
        // Single tighter hand-drawn line for small segmented toggles.
        const inset = 3;
        layers.push(
          rc.rectangle(inset, inset, w - 2 * inset, h - 2 * inset, {
            stroke: NAVY,
            strokeWidth: 1.6,
            roughness: 1.5,
            seed,
          }),
        );
      } else {
        // Double-line scorecard frame: navy outer + a faint navy inner rule.
        const inset = 5;
        layers.push(
          rc.rectangle(inset, inset, w - 2 * inset, h - 2 * inset, {
            stroke: NAVY,
            strokeWidth: 2.5,
            roughness: 1.4,
            seed,
          }),
        );
        const inset2 = inset + 4;
        layers.push(
          rc.rectangle(inset2, inset2, w - 2 * inset2, h - 2 * inset2, {
            stroke: INK_FAINT,
            strokeWidth: 1,
            roughness: 2,
            seed: seed + 1,
          }),
        );
      }
      for (const g of layers) svg.appendChild(g);

      if (!inkedRef.current) {
        if (inView) {
          svg.classList.remove("ink-pending");
          // Outer line first; the faint inner rule follows a beat behind.
          inkify(layers[0], { step: variant === "control" ? 45 : 60 });
          if (layers[1]) inkify(layers[1], { delay: 200, step: 60 });
          inkedRef.current = true;
        } else {
          svg.classList.add("ink-pending");
        }
      }
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };
    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(box);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [seed, variant, inView]);

  const surface =
    variant === "control" ? "rounded-md bg-dirt/40" : "rounded-lg bg-dirt/40";
  const lift = variant === "card";

  return (
    <motion.div
      ref={boxRef}
      className={`group relative isolate ${surface} ${className ?? ""}`}
      style={variant === "control" ? undefined : { boxShadow: SHADOW_REST }}
      whileHover={
        lift ? { y: -4, rotate: -0.4, boxShadow: SHADOW_LIFT } : undefined
      }
      whileTap={lift ? { y: -1, scale: 0.99 } : undefined}
      transition={{
        ...SPRING_SOFT,
        boxShadow: { duration: DUR.hover, ease: EASE_SOFT },
      }}
    >
      <svg
        ref={svgRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
      />
      {children}
    </motion.div>
  );
}
