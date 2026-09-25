"use client";

import { useMemo, useRef } from "react";
import { scaleLinear } from "d3-scale";
import { useInView } from "motion/react";
import ChartTooltip from "@/components/charts/ChartTooltip";
import { useLingeringHover } from "@/lib/use-lingering-hover";
import {
  CATEGORY_COLOR,
  CATEGORY_Z,
  categorize,
  type Category,
} from "@/lib/batted-ball-categories";
import type { BattedBallEvent } from "@/components/charts/SprayChart";

// UI strings passed in so the chart stays framework-pure (no next-intl import).
export type ExitVeloChartLabels = {
  homeRun: string;
  extraBase: string;
  single: string;
  out: string;
  date: string;
  pitch: string;
  exitVelo: string;
  launchAngle: string;
  axisEV: string;
  axisLA: string;
  barrelZone: string;
};

// Human-readable outcome (baseball jargon stays English in every locale).
function resultLabel(event: string | null): string {
  if (!event) return "—";
  return event
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

type PlacedPoint = {
  ev: BattedBallEvent;
  cx: number;
  cy: number;
  category: Category;
};

const MARGIN = { top: 16, right: 16, bottom: 40, left: 48 };

// Minimum axis ranges so a sparse filter (e.g. only HRs) still renders a stable,
// readable plot rather than a zoomed-in sliver.
const LA_MIN_RANGE: [number, number] = [-30, 50];
const EV_MIN_RANGE: [number, number] = [60, 115];

// Barrel "sweet spot" reference band — visual only. Per-event barrel
// classification needs launch_speed_angle, which is not in the DB
// (see docs/DATA_MODEL.md anti-index).
const BARREL_EV_MIN = 98;
const BARREL_LA: [number, number] = [26, 30];

export default function ExitVeloChart({
  events,
  labels,
  width = 560,
}: {
  events: BattedBallEvent[];
  labels: ExitVeloChartLabels;
  width?: number;
}) {
  const height = Math.round(width * 0.72);
  const { hovered, last, enter, leave } = useLingeringHover<PlacedPoint>();
  const svgRef = useRef<SVGSVGElement>(null);
  const inView = useInView(svgRef, { once: true, amount: 0.3 });

  const { placed, xScale, yScale, xTicks, yTicks } = useMemo(() => {
    // Only points with BOTH EV and LA can be positioned.
    const usable = events.filter(
      (e) => e.launch_speed != null && e.launch_angle != null,
    );

    const las = usable.map((e) => e.launch_angle as number);
    const evs = usable.map((e) => e.launch_speed as number);

    const laDomain: [number, number] = [
      Math.min(LA_MIN_RANGE[0], ...las),
      Math.max(LA_MIN_RANGE[1], ...las),
    ];
    const evDomain: [number, number] = [
      Math.min(EV_MIN_RANGE[0], ...evs),
      Math.max(EV_MIN_RANGE[1], ...evs),
    ];

    // ~5% padding on each side.
    const laPad = (laDomain[1] - laDomain[0]) * 0.05;
    const evPad = (evDomain[1] - evDomain[0]) * 0.05;

    const xScale = scaleLinear(
      [laDomain[0] - laPad, laDomain[1] + laPad],
      [MARGIN.left, width - MARGIN.right],
    );
    const yScale = scaleLinear(
      [evDomain[0] - evPad, evDomain[1] + evPad],
      [height - MARGIN.bottom, MARGIN.top],
    );

    const placed: PlacedPoint[] = usable
      .map((ev) => ({
        ev,
        cx: xScale(ev.launch_angle as number),
        cy: yScale(ev.launch_speed as number),
        category: categorize(ev.event),
      }))
      .sort((a, b) => CATEGORY_Z[a.category] - CATEGORY_Z[b.category]);

    return {
      placed,
      xScale,
      yScale,
      xTicks: xScale.ticks(8),
      yTicks: yScale.ticks(6),
    };
  }, [events, width, height]);

  const legend: { category: Category; label: string }[] = [
    { category: "hr", label: labels.homeRun },
    { category: "xbh", label: labels.extraBase },
    { category: "single", label: labels.single },
    { category: "out", label: labels.out },
  ];

  const barrelX = xScale(BARREL_LA[0]);
  const barrelW = xScale(BARREL_LA[1]) - xScale(BARREL_LA[0]);
  const barrelYTop = MARGIN.top;
  const barrelYBottom = yScale(BARREL_EV_MIN);

  return (
    <div className="flex flex-col">
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
          aria-label="Exit velocity vs launch angle scatter plot"
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

          {/* barrel zone reference band (visual only) */}
          {barrelW > 0 && barrelYBottom > barrelYTop && (
            <>
              <rect
                x={barrelX}
                y={barrelYTop}
                width={barrelW}
                height={barrelYBottom - barrelYTop}
                fill="var(--color-brick)"
                fillOpacity={0.08}
                stroke="none"
              />
              <text
                x={barrelX + barrelW / 2}
                y={barrelYTop + 10}
                textAnchor="middle"
                fill="var(--color-brick)"
                fillOpacity={0.6}
                fontSize={9}
              >
                {labels.barrelZone}
              </text>
            </>
          )}

          {/* axes */}
          <line
            x1={MARGIN.left}
            y1={height - MARGIN.bottom}
            x2={width - MARGIN.right}
            y2={height - MARGIN.bottom}
            stroke="var(--color-navy)"
            strokeOpacity={0.4}
            strokeWidth={1}
          />
          <line
            x1={MARGIN.left}
            y1={MARGIN.top}
            x2={MARGIN.left}
            y2={height - MARGIN.bottom}
            stroke="var(--color-navy)"
            strokeOpacity={0.4}
            strokeWidth={1}
          />

          {/* x tick labels */}
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
          {/* y tick labels */}
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
            {labels.axisLA}
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
            {labels.axisEV}
          </text>

          {/* points — pop in staggered across ~0.6s (.dot-pop) */}
          {placed.map((p, i) => (
            <circle
              key={p.ev.id}
              className="chart-dot dot-pop cursor-pointer"
              data-hot={hovered === p || undefined}
              cx={p.cx}
              cy={p.cy}
              r={4}
              fill={CATEGORY_COLOR[p.category]}
              fillOpacity={p.category === "out" ? 0.3 : 0.85}
              stroke={p.category === "hr" ? "var(--color-papaya)" : "none"}
              strokeWidth={p.category === "hr" ? 1 : 0}
              onMouseEnter={() => enter(p)}
              onMouseLeave={leave}
              style={{
                animationDelay: `${Math.round((i / Math.max(1, placed.length)) * 600)}ms`,
              }}
            />
          ))}
        </svg>

        {last && (
          <ChartTooltip
            open={hovered !== null}
            left={(last.cx / width) * 100}
            top={(last.cy / height) * 100}
          >
            <div className="font-medium text-navy">
              {resultLabel(last.ev.event)}
            </div>
            <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-navy/70">
              <dt>{labels.date}</dt>
              <dd>{last.ev.game_date}</dd>
              {last.ev.pitch_type && (
                <>
                  <dt>{labels.pitch}</dt>
                  <dd>{last.ev.pitch_type}</dd>
                </>
              )}
              {last.ev.launch_speed != null && (
                <>
                  <dt>{labels.exitVelo}</dt>
                  <dd>{last.ev.launch_speed.toFixed(1)} mph</dd>
                </>
              )}
              {last.ev.launch_angle != null && (
                <>
                  <dt>{labels.launchAngle}</dt>
                  <dd>{Math.round(last.ev.launch_angle)}&deg;</dd>
                </>
              )}
            </dl>
          </ChartTooltip>
        )}
      </div>

      {/* legend */}
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-navy/70">
        {legend.map(({ category, label }) => (
          <li key={category} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor: CATEGORY_COLOR[category],
                opacity: category === "out" ? 0.45 : 0.9,
              }}
            />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
