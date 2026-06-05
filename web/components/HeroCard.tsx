"use client";

import Image from "next/image";
import { useLayoutEffect, useRef } from "react";
import rough from "roughjs";
import { Link } from "@/i18n/navigation";

// Mirrors the schedule calendar's hand-drawn treatment (see ScheduleCalendar.tsx):
// rough.js needs literal colors, so these track the @theme tokens in globals.css.
const NAVY = "#003049";
const INK_FAINT = "rgba(0, 48, 73, 0.28)"; // faint navy inner rule

// Stable per-card seed so the wobble doesn't shimmer on resize.
function seedFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 100000;
}

export default function HeroCard({
  href,
  headshot,
  name,
  headline,
}: {
  href: string;
  headshot: string | null;
  name: string;
  headline: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const seed = seedFromString(href);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const svg = svgRef.current;
    if (!box || !svg) return;

    let raf = 0;
    const draw = () => {
      const w = box.clientWidth;
      const h = box.clientHeight;
      if (w === 0 || h === 0) return;
      svg.setAttribute("width", String(w));
      svg.setAttribute("height", String(h));
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const rc = rough.svg(svg);

      // Double-line scorecard frame: navy outer + a faint navy inner rule.
      const inset = 5;
      svg.appendChild(
        rc.rectangle(inset, inset, w - 2 * inset, h - 2 * inset, {
          stroke: NAVY,
          strokeWidth: 2.5,
          roughness: 1.4,
          seed,
        }),
      );
      const inset2 = inset + 4;
      svg.appendChild(
        rc.rectangle(inset2, inset2, w - 2 * inset2, h - 2 * inset2, {
          stroke: INK_FAINT,
          strokeWidth: 1,
          roughness: 2,
          seed: seed + 1,
        }),
      );
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
  }, [seed]);

  return (
    <div
      ref={boxRef}
      className="group relative isolate rounded-lg bg-dirt/40 shadow-[5px_5px_0_0_#00304933] transition-transform hover:-translate-y-0.5"
    >
      <svg
        ref={svgRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
      />
      <Link href={href} className="relative z-10 flex items-center gap-3 p-4">
        {headshot && (
          <Image
            src={headshot}
            alt={name}
            width={56}
            height={56}
            unoptimized
            className="rounded-full bg-papaya ring-1 ring-navy/15"
          />
        )}
        <p className="text-sm font-medium leading-snug text-navy">{headline}</p>
      </Link>
    </div>
  );
}
