"use client";

// Runs scored vs runs allowed PER GAME, month by month, for one season — the
// rate view of the month-by-month table (months have different game counts, so
// raw RS-RA totals don't compare across rows). Offense brick / run prevention
// navy, as in the team page's run-sources chart; the MLB average R/G for the
// season is the dashed steel reference. Every point carries its value (above
// the higher line, below the lower one) and the last point names its line, so
// the exported PNG reads without the HTML legend. Drawn on scroll-in.

import { useReducedMotion } from "motion/react";
import { LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import WhenInView from "@/components/motion/WhenInView";

export type MonthRuns = { label: string; rs: number; ra: number; record: string };

type Series = "rs" | "ra";
const COLOR: Record<Series, string> = { rs: "var(--color-brick)", ra: "var(--color-navy)" };
// Jargon: English in both locales (the team-stats table's own labels).
const END_LABEL: Record<Series, string> = { rs: "R/G", ra: "RA/G" };

export default function MonthlyRunsChart({
  data,
  mlbRunsPerGame,
  labels,
}: {
  data: MonthRuns[];
  mlbRunsPerGame: number | null;
  labels: { rs: string; ra: string; mlb: string };
}) {
  const reduce = useReducedMotion();
  if (data.length === 0) return null;
  const anim = { isAnimationActive: !reduce, animationDuration: 1100, animationEasing: "ease-out" as const };

  // Value label above the higher of the two points, below the lower one.
  const pointLabel = (series: Series) =>
    function PointLabel(props: { x?: number | string; y?: number | string; index?: number }) {
      const d = data[props.index ?? -1];
      if (!d || props.x == null || props.y == null) return null;
      const x = Number(props.x);
      const y = Number(props.y);
      const other: Series = series === "rs" ? "ra" : "rs";
      const above = d[series] >= d[other];
      const last = props.index === data.length - 1;
      return (
        <g>
          <text x={x} y={above ? y - 8 : y + 15} textAnchor="middle" fontSize={10} fill={COLOR[series]} fillOpacity={0.85}>
            {d[series].toFixed(2)}
          </text>
          {last && (
            <text x={x + 8} y={y + 3.5} fontSize={10} fill={COLOR[series]}>
              {END_LABEL[series]}
            </text>
          )}
        </g>
      );
    };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-navy/55">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-brick" aria-hidden />
          {labels.rs}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-navy" aria-hidden />
          {labels.ra}
        </span>
        {mlbRunsPerGame != null && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-2 border-dashed border-steel" aria-hidden />
            {labels.mlb}
          </span>
        )}
      </div>
      <WhenInView className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 18, right: 40, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--color-navy)", opacity: 0.7 }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-navy)", opacity: 0.2 }}
              interval={0}
              padding={{ left: 16, right: 16 }}
            />
            <YAxis
              width={34}
              domain={[(min: number) => Math.floor(min * 2) / 2 - 0.25, (max: number) => Math.ceil(max * 2) / 2 + 0.25]}
              tick={{ fontSize: 10, fill: "var(--color-navy)", opacity: 0.55 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => v.toFixed(1)}
            />
            {mlbRunsPerGame != null && (
              <ReferenceLine
                y={mlbRunsPerGame}
                ifOverflow="extendDomain"
                stroke="var(--color-steel)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            )}
            <Tooltip
              cursor={{ stroke: "var(--color-steel)", strokeWidth: 1 }}
              animationDuration={350}
              animationEasing="ease-out"
              contentStyle={{ borderRadius: 8, border: "1px solid var(--color-navy)", fontSize: 12, padding: "4px 8px" }}
              labelFormatter={(label, payload) => {
                const p = payload?.[0]?.payload as MonthRuns | undefined;
                return p ? `${label} · ${p.record}` : String(label);
              }}
              formatter={(value, name) => [(value as number).toFixed(2), name === "rs" ? labels.rs : labels.ra]}
            />
            {(["ra", "rs"] as const).map((s) => (
              <Line
                key={s}
                type="linear"
                dataKey={s}
                stroke={COLOR[s]}
                strokeWidth={2}
                dot={{ r: 3, fill: COLOR[s], stroke: "var(--color-papaya)", strokeWidth: 1 }}
                activeDot={{ r: 4.5, fill: COLOR[s], stroke: "var(--color-papaya)", strokeWidth: 1.5 }}
                {...anim}
              >
                <LabelList dataKey={s} content={pointLabel(s)} />
              </Line>
            ))}
          </LineChart>
        </ResponsiveContainer>
      </WhenInView>
    </div>
  );
}
