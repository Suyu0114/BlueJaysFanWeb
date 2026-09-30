"use client";

// P12 M3: primary-fastball velocity per appearance, two seasons overlaid on an
// APPEARANCE-NUMBER axis (dates don't line up across seasons). Focus season
// brick, comparison season dashed steel (D8). Release-frame field only, so the
// 2026 plate-coordinate change doesn't matter here.

import { useReducedMotion } from "motion/react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import WhenInView from "@/components/motion/WhenInView";

export default function VeloCompareChart({
  a,
  b,
  seasonA,
  seasonB,
  labels,
}: {
  a: number[]; // avg velo by appearance, focus season
  b: number[];
  seasonA: number;
  seasonB: number;
  labels: { appearance: string };
}) {
  const reduce = useReducedMotion();
  const n = Math.max(a.length, b.length);
  if (n === 0) return null;
  const data = Array.from({ length: n }, (_, i) => ({ n: i + 1, a: a[i] ?? null, b: b[i] ?? null }));
  const line = { isAnimationActive: !reduce, animationDuration: 900, animationEasing: "ease-out" as const };

  return (
    <WhenInView className="h-[160px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="n"
            type="number"
            domain={[1, n]}
            allowDecimals={false}
            tick={{ fontSize: 10, fill: "var(--color-navy)", opacity: 0.55 }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-navy)", opacity: 0.2 }}
          />
          <YAxis
            width={34}
            domain={[(min: number) => Math.floor(min - 1), (max: number) => Math.ceil(max + 1)]}
            tick={{ fontSize: 10, fill: "var(--color-navy)", opacity: 0.55 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => v.toFixed(0)}
          />
          <Tooltip
            cursor={{ stroke: "var(--color-steel)", strokeWidth: 1 }}
            animationDuration={350}
            animationEasing="ease-out"
            contentStyle={{ borderRadius: 8, border: "1px solid var(--color-navy)", fontSize: 12, padding: "4px 8px" }}
            labelFormatter={(label) => `${labels.appearance} ${label}`}
            formatter={(value, name) => [
              value == null ? "—" : `${(value as number).toFixed(1)} mph`,
              name === "a" ? String(seasonA) : String(seasonB),
            ]}
          />
          <Line type="monotone" dataKey="b" stroke="var(--color-steel)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls={false} {...line} />
          <Line type="monotone" dataKey="a" stroke="var(--color-brick)" strokeWidth={2} dot={{ r: 2, fill: "var(--color-brick)", strokeWidth: 0 }} connectNulls={false} {...line} />
        </LineChart>
      </ResponsiveContainer>
    </WhenInView>
  );
}
