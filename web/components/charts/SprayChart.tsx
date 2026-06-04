"use client";

import { useMemo, useState } from "react";
import { scaleLinear } from "d3-scale";
import {
  BASES,
  DISTANCE_MARKERS,
  FIELD,
  FIELD_HEIGHT_FT,
  FIELD_WIDTH_FT,
  FOUL_LINES,
  INFIELD_DIAMOND,
  MOUND,
  fairTerritoryPoints,
  foulGroundPoints,
  infieldDirtPoints,
  outfieldWallPoints,
  warningTrackPoints,
  toPath,
  type Point,
  type Project,
} from "@/lib/field-geometry";
import {
  CATEGORY_COLOR,
  CATEGORY_Z,
  categorize,
  type Category,
} from "@/lib/batted-ball-categories";

export type BattedBallEvent = {
  id: string;
  x_feet: number;
  y_feet: number;
  launch_speed: number | null;
  launch_angle: number | null;
  event: string | null;
  pitch_type: string | null;
  p_throws: string | null; // pitcher handedness: "L" | "R"
  game_date: string; // YYYY-MM-DD
};

// UI strings passed in so the chart stays framework-pure (no next-intl import).
export type SprayChartLabels = {
  homeRun: string;
  extraBase: string;
  single: string;
  out: string;
  date: string;
  pitch: string;
  exitVelo: string;
  launchAngle: string;
};

// Human-readable outcome (baseball jargon stays English in every locale).
function resultLabel(event: string | null): string {
  if (!event) return "—";
  return event
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

type PlacedEvent = {
  ev: BattedBallEvent;
  cx: number;
  cy: number;
  r: number;
  category: Category;
};

export default function SprayChart({
  events,
  labels,
  width = 640,
  secondaryEvents,
  secondaryColor = "var(--color-steel)",
}: {
  events: BattedBallEvent[];
  labels: SprayChartLabels;
  width?: number;
  // Optional comparison layer (used by /compare). Rendered under the primary
  // markers at a fixed muted opacity; categorized + sized the same way as
  // primary so the comparison stays apples-to-apples.
  secondaryEvents?: BattedBallEvent[];
  secondaryColor?: string;
}) {
  const height = (width * FIELD_HEIGHT_FT) / FIELD_WIDTH_FT;
  const pxPerFoot = width / FIELD_WIDTH_FT;
  const [hovered, setHovered] = useState<PlacedEvent | null>(null);

  const { project, placed, placedSecondary, wallPath, fairPath, foulPath, dirtPath, warningPath } =
    useMemo(() => {
      const xScale = scaleLinear([FIELD.xMin, FIELD.xMax], [0, width]);
      const yScale = scaleLinear([FIELD.yMin, FIELD.yMax], [height, 0]);
      const project: Project = (x, y) => [xScale(x), yScale(y)];

      // Marker radius scales with exit velocity (60-115 mph -> 3-8 px).
      const rScale = scaleLinear([60, 115], [3, 8]).clamp(true);

      const place = (list: BattedBallEvent[]): PlacedEvent[] =>
        list
          .map((ev) => {
            const [cx, cy] = project(ev.x_feet, ev.y_feet);
            const category = categorize(ev.event);
            const r = ev.launch_speed == null ? 3 : rScale(ev.launch_speed);
            return { ev, cx, cy, r, category };
          })
          .sort((a, b) => CATEGORY_Z[a.category] - CATEGORY_Z[b.category]);

      return {
        project,
        placed: place(events),
        placedSecondary: secondaryEvents ? place(secondaryEvents) : [],
        wallPath: toPath(outfieldWallPoints(), project),
        fairPath: toPath(fairTerritoryPoints(), project, true),
        foulPath: toPath(foulGroundPoints(), project, true),
        dirtPath: toPath(infieldDirtPoints(), project, true),
        warningPath: toPath(warningTrackPoints(), project, true),
      };
    }, [events, secondaryEvents, width, height]);

  const baseSize = width * 0.014;

  const legend: { category: Category; label: string }[] = [
    { category: "hr", label: labels.homeRun },
    { category: "xbh", label: labels.extraBase },
    { category: "single", label: labels.single },
    { category: "out", label: labels.out },
  ];

  return (
    <div className="flex h-full flex-col">
      <div
        className="relative min-h-0 flex-1 self-center"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-full w-full"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Spray chart"
        >
          {/* foul ground — grass */}
          <path d={foulPath} fill="var(--color-grass)" fillOpacity={0.25} stroke="none" />

          {/* fair territory — grass */}
          <path d={fairPath} fill="var(--color-grass)" fillOpacity={0.7} stroke="none" />

          {/* warning track — dirt (opacity 0: intentionally hidden) */}
          <path d={warningPath} fill="var(--color-dirt)" fillOpacity={0} stroke="none" />

          {/* infield dirt circle — clipped to fair territory */}
          <path d={dirtPath} fill="var(--color-dirt)" fillOpacity={1} stroke="none" />
          {/* pitcher's mound + home-plate circles */}
          {([
            [MOUND, 9],
            [BASES.home, 13],
          ] as [Point, number][]).map(([pt, rFt], i) => {
            const [px, py] = project(pt[0], pt[1]);
            return (
              <circle
                key={`c${i}`}
                cx={px}
                cy={py}
                r={rFt * pxPerFoot}
                fill="none"
                stroke="var(--color-navy)"
                strokeOpacity={0.3}
                strokeWidth={1}
              />
            );
          })}
          {/* outfield wall */}
          <path
            d={wallPath}
            fill="none"
            stroke="var(--color-lava)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* foul lines */}
          {FOUL_LINES.map(([a, b], i) => {
            const [ax, ay] = project(a[0], a[1]);
            const [bx, by] = project(b[0], b[1]);
            return (
              <line
                key={`f${i}`}
                x1={ax}
                y1={ay}
                x2={bx}
                y2={by}
                stroke="var(--color-lava)"
                strokeOpacity={0.7}
                strokeWidth={2}
              />
            );
          })}
          {/* bases */}
          {[BASES.home, BASES.first, BASES.second, BASES.third].map(
            ([bxf, byf], i) => {
              const [px, py] = project(bxf, byf);
              return (
                <rect
                  key={`b${i}`}
                  x={px - baseSize / 2}
                  y={py - baseSize / 2}
                  width={baseSize}
                  height={baseSize}
                  transform={`rotate(45 ${px} ${py})`}
                  fill="var(--color-papaya)"
                  stroke="var(--color-navy)"
                  strokeOpacity={0.5}
                  strokeWidth={1}
                />
              );
            },
          )}
          {/* distance markers */}
          {DISTANCE_MARKERS.map((m, i) => {
            const [px, py] = project(m.at[0], m.at[1]);
            return (
              <text
                key={`d${i}`}
                x={px}
                y={py}
                textAnchor={m.anchor}
                dominantBaseline="middle"
                fill="var(--color-navy)"
                fillOpacity={0.55}
                fontSize={11}
              >
                {m.label}
              </text>
            );
          })}
          {/* secondary (comparison) batted balls — muted, drawn under primary */}
          {placedSecondary.map((p) => (
            <circle
              key={`s-${p.ev.id}`}
              cx={p.cx}
              cy={p.cy}
              r={p.r}
              fill={secondaryColor}
              fillOpacity={0.45}
              stroke="none"
            />
          ))}
          {/* batted balls */}
          {placed.map((p) => (
            <circle
              key={p.ev.id}
              cx={p.cx}
              cy={p.cy}
              r={p.r}
              fill={CATEGORY_COLOR[p.category]}
              fillOpacity={p.category === "out" ? 0.25 : 0.85}
              stroke={p.category === "hr" ? "var(--color-papaya)" : "none"}
              strokeWidth={p.category === "hr" ? 1 : 0}
              onMouseEnter={() => setHovered(p)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "pointer" }}
            />
          ))}
        </svg>

        {hovered && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-navy/20 bg-white px-3 py-2 text-xs shadow-md"
            style={{
              left: `${(hovered.cx / width) * 100}%`,
              top: `${(hovered.cy / height) * 100}%`,
              marginTop: -8,
            }}
          >
            <div className="font-medium text-navy">
              {resultLabel(hovered.ev.event)}
            </div>
            <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-navy/70">
              <dt>{labels.date}</dt>
              <dd>{hovered.ev.game_date}</dd>
              {hovered.ev.pitch_type && (
                <>
                  <dt>{labels.pitch}</dt>
                  <dd>{hovered.ev.pitch_type}</dd>
                </>
              )}
              {hovered.ev.launch_speed != null && (
                <>
                  <dt>{labels.exitVelo}</dt>
                  <dd>{hovered.ev.launch_speed.toFixed(1)} mph</dd>
                </>
              )}
              {hovered.ev.launch_angle != null && (
                <>
                  <dt>{labels.launchAngle}</dt>
                  <dd>{Math.round(hovered.ev.launch_angle)}&deg;</dd>
                </>
              )}
            </dl>
          </div>
        )}
      </div>

      {/* legend */}
      <ul className="mt-1 flex shrink-0 flex-wrap gap-x-4 gap-y-0.5 text-xs text-navy/70">
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
