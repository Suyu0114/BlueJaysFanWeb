"use client";

// P10: Savant-style pitch movement plot. Each faint dot is one pitch; the bold
// ringed dot is the pitch type's average break, direct-labeled with its code so
// identity never relies on color alone (several families share a brand hue).
//
// Coordinates: pfx_x / pfx_z arrive in FEET from the catcher's perspective
// (raw Savant). This chart shows the PITCHER'S view, so x is sign-flipped and
// both axes are converted to inches — that happens in exactly one place
// (`toInches` below). The 0/0 crosshair = a theoretical spinless pitch.
//
// Alignment note (docs/DATA_MODEL.md): pfx_* is a release-frame measurement,
// NOT a plate coordinate — it is plate_alignment-agnostic and safe to render
// across 2025/2026 seasons together. Only PitchZoneHeatmap needs alignment
// scoping.

import { useMemo, useRef } from "react";
import { scaleLinear } from "d3-scale";
import { motion, useInView } from "motion/react";
import ChartTooltip from "@/components/charts/ChartTooltip";
import { SPRING_SOFT } from "@/lib/motion";
import { useLingeringHover } from "@/lib/use-lingering-hover";
import type { PitchEvent } from "@/lib/pitch-arsenal";
import { colorFor } from "@/lib/pitch-colors";

export type PitchMovementLabels = {
  axisHorz: string; // "Horizontal break (in)"
  axisVert: string; // "Vertical break (in)"
  pitches: string; // tooltip: sample size label
  avgVelo: string; // tooltip: velocity label
};

type MeanMark = {
  pitchType: string;
  cx: number;
  cy: number;
  hIn: number;
  vIn: number;
  n: number;
  avgVelo: number | null;
};

const MARGIN = { top: 16, right: 16, bottom: 40, left: 48 };
// Minimum ±inches so a sparse subset still renders a stable window; Savant's
// plot spans roughly ±25".
const MIN_RANGE_IN = 25;
// SVG circles get slow in the thousands; a 3-season starter is ~9k pitches.
// Uniform-stride sample for the faint background dots (means use ALL rows).
const MAX_DOTS = 1500;

export default function PitchMovementChart({
  pitches,
  labels,
  width = 420,
}: {
  pitches: PitchEvent[];
  labels: PitchMovementLabels;
  width?: number;
}) {
  const height = width; // movement space is symmetric; keep it square
  const { hovered, last, enter, leave } = useLingeringHover<MeanMark>();
  const svgRef = useRef<SVGSVGElement>(null);
  const inView = useInView(svgRef, { once: true, amount: 0.3 });

  const { dots, means, xScale, yScale, xTicks, yTicks } = useMemo(() => {
    // Pitcher's view: flip pfx_x; feet -> inches.
    const toInches = (p: PitchEvent): [number, number] => [
      -(p.pfx_x as number) * 12,
      (p.pfx_z as number) * 12,
    ];

    const usable = pitches.filter(
      (p) => p.pfx_x != null && p.pfx_z != null && p.pitch_type != null,
    );

    let extent = MIN_RANGE_IN;
    for (const p of usable) {
      const [hx, vy] = toInches(p);
      extent = Math.max(extent, Math.abs(hx), Math.abs(vy));
    }
    extent += 2; // breathing room

    const xScale = scaleLinear(
      [-extent, extent],
      [MARGIN.left, width - MARGIN.right],
    );
    const yScale = scaleLinear(
      [-extent, extent],
      [height - MARGIN.bottom, MARGIN.top],
    );

    const stride = Math.max(1, Math.ceil(usable.length / MAX_DOTS));
    const dots = usable
      .filter((_, i) => i % stride === 0)
      .map((p) => {
        const [hx, vy] = toInches(p);
        return {
          id: p.id,
          cx: xScale(hx),
          cy: yScale(vy),
          color: colorFor(p.pitch_type as string),
        };
      });

    const byType = new Map<
      string,
      { hSum: number; vSum: number; n: number; veloSum: number; veloN: number }
    >();
    for (const p of usable) {
      const [hx, vy] = toInches(p);
      const g =
        byType.get(p.pitch_type as string) ??
        { hSum: 0, vSum: 0, n: 0, veloSum: 0, veloN: 0 };
      g.hSum += hx;
      g.vSum += vy;
      g.n += 1;
      if (p.release_speed != null) {
        g.veloSum += p.release_speed;
        g.veloN += 1;
      }
      byType.set(p.pitch_type as string, g);
    }
    const means: MeanMark[] = [...byType.entries()]
      .map(([pitchType, g]) => {
        const hIn = g.hSum / g.n;
        const vIn = g.vSum / g.n;
        return {
          pitchType,
          cx: xScale(hIn),
          cy: yScale(vIn),
          hIn,
          vIn,
          n: g.n,
          avgVelo: g.veloN === 0 ? null : g.veloSum / g.veloN,
        };
      })
      .sort((a, b) => b.n - a.n);

    return {
      dots,
      means,
      xScale,
      yScale,
      xTicks: xScale.ticks(6),
      yTicks: yScale.ticks(6),
    };
  }, [pitches, width, height]);

  if (means.length === 0) return null;

  return (
    <div
      className="relative w-full"
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className={`h-full w-full ${inView ? "" : "anim-paused"}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Pitch movement scatter plot"
      >
        {/* gridlines */}
        {xTicks.map((tk) => (
          <line
            key={`gx${tk}`}
            x1={xScale(tk)}
            y1={MARGIN.top}
            x2={xScale(tk)}
            y2={height - MARGIN.bottom}
            stroke="var(--color-navy)"
            strokeOpacity={0.08}
            strokeWidth={1}
          />
        ))}
        {yTicks.map((tk) => (
          <line
            key={`gy${tk}`}
            x1={MARGIN.left}
            y1={yScale(tk)}
            x2={width - MARGIN.right}
            y2={yScale(tk)}
            stroke="var(--color-navy)"
            strokeOpacity={0.08}
            strokeWidth={1}
          />
        ))}

        {/* 0/0 crosshair: the spinless-pitch reference */}
        <line
          x1={xScale(0)}
          y1={MARGIN.top}
          x2={xScale(0)}
          y2={height - MARGIN.bottom}
          stroke="var(--color-navy)"
          strokeOpacity={0.3}
          strokeWidth={1}
          strokeDasharray="4 3"
        />
        <line
          x1={MARGIN.left}
          y1={yScale(0)}
          x2={width - MARGIN.right}
          y2={yScale(0)}
          stroke="var(--color-navy)"
          strokeOpacity={0.3}
          strokeWidth={1}
          strokeDasharray="4 3"
        />

        {/* tick labels */}
        {xTicks.map((tk) => (
          <text
            key={`tx${tk}`}
            x={xScale(tk)}
            y={height - MARGIN.bottom + 14}
            textAnchor="middle"
            fill="var(--color-navy)"
            fillOpacity={0.55}
            fontSize={10}
          >
            {tk}
          </text>
        ))}
        {yTicks.map((tk) => (
          <text
            key={`ty${tk}`}
            x={MARGIN.left - 6}
            y={yScale(tk)}
            textAnchor="end"
            dominantBaseline="middle"
            fill="var(--color-navy)"
            fillOpacity={0.55}
            fontSize={10}
          >
            {tk}
          </text>
        ))}

        {/* axis titles */}
        <text
          x={MARGIN.left + (width - MARGIN.left - MARGIN.right) / 2}
          y={height - 4}
          textAnchor="middle"
          fill="var(--color-navy)"
          fillOpacity={0.7}
          fontSize={11}
        >
          {labels.axisHorz}
        </text>
        <text
          transform={`rotate(-90 12 ${
            MARGIN.top + (height - MARGIN.top - MARGIN.bottom) / 2
          })`}
          x={12}
          y={MARGIN.top + (height - MARGIN.top - MARGIN.bottom) / 2}
          textAnchor="middle"
          fill="var(--color-navy)"
          fillOpacity={0.7}
          fontSize={11}
        >
          {labels.axisVert}
        </text>

        {/* individual pitches (sampled) — pop in staggered across ~0.5s */}
        {dots.map((d, i) => (
          <circle
            key={d.id}
            className="chart-dot dot-pop"
            cx={d.cx}
            cy={d.cy}
            r={2.5}
            fill={d.color}
            fillOpacity={0.18}
            style={{
              animationDelay: `${Math.round((i / Math.max(1, dots.length)) * 500)}ms`,
            }}
          />
        ))}

        {/* per-type mean markers + direct labels. Positioned by a motion <g>
            translate so a filter change GLIDES each mean to its new spot; they
            pop in after the cloud on first render. */}
        {means.map((m, k) => (
          <motion.g
            key={m.pitchType}
            initial={{ x: m.cx, y: m.cy, opacity: 0, scale: 0.4 }}
            animate={
              inView
                ? { x: m.cx, y: m.cy, opacity: 1, scale: 1 }
                : { x: m.cx, y: m.cy, opacity: 0, scale: 0.4 }
            }
            transition={{
              ...SPRING_SOFT,
              opacity: { duration: 0.3, delay: 0.45 + k * 0.08 },
              scale: { ...SPRING_SOFT, delay: 0.45 + k * 0.08 },
            }}
          >
            <circle
              className="chart-dot cursor-pointer"
              data-hot={hovered === m || undefined}
              cx={0}
              cy={0}
              r={7}
              fill={colorFor(m.pitchType)}
              stroke="var(--color-papaya)"
              strokeWidth={2}
              onMouseEnter={() => enter(m)}
              onMouseLeave={leave}
            />
            <text
              x={10}
              y={0}
              dominantBaseline="middle"
              fill="var(--color-navy)"
              fontSize={11}
              fontWeight={600}
            >
              {m.pitchType}
            </text>
          </motion.g>
        ))}
      </svg>

      {last && (
        <ChartTooltip
          open={hovered !== null}
          left={(last.cx / width) * 100}
          top={(last.cy / height) * 100}
          gap={10}
        >
          <div className="font-medium text-navy">{last.pitchType}</div>
          <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-navy/70">
            <dt>{labels.axisHorz}</dt>
            <dd>{last.hIn.toFixed(1)}&quot;</dd>
            <dt>{labels.axisVert}</dt>
            <dd>{last.vIn.toFixed(1)}&quot;</dd>
            {last.avgVelo != null && (
              <>
                <dt>{labels.avgVelo}</dt>
                <dd>{last.avgVelo.toFixed(1)} mph</dd>
              </>
            )}
            <dt>{labels.pitches}</dt>
            <dd>{last.n}</dd>
          </dl>
        </ChartTooltip>
      )}
    </div>
  );
}
