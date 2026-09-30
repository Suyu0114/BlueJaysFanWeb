"use client";

// P13 module ①: "where the wins came from". Per season, the run differential
// split into offense (runs scored above an average MLB team over the same
// games — brick) and run prevention (runs NOT allowed vs that average — navy),
// stacked from zero (stackOffset "sign": negatives stack downward), with the
// net run differential as a lava dot. The split is computed in the 022 view
// (offense_runs + prevention_runs = run_diff exactly); this only draws it.

import { useReducedMotion } from "motion/react";
import {
  Bar,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import WhenInView from "@/components/motion/WhenInView";

export type RunSourcePoint = { season: string; offense: number; prevention: number; net: number };

// Tooltip rows in legend order (Recharts would otherwise interleave the Line).
const ORDER = ["offense", "prevention", "net"];

const signed = (v: number) => {
  const r = Math.round(v);
  return r > 0 ? `+${r}` : r < 0 ? `−${Math.abs(r)}` : "0";
};

export default function RunSourcesChart({
  data,
  labels,
}: {
  data: RunSourcePoint[];
  labels: { offense: string; prevention: string; net: string };
}) {
  const reduce = useReducedMotion();
  const anim = { isAnimationActive: !reduce, animationDuration: 800, animationEasing: "ease-out" as const };

  return (
    <div>
      <WhenInView className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} stackOffset="sign" margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
            <XAxis
              dataKey="season"
              tick={{ fontSize: 11, fill: "var(--color-navy)", opacity: 0.7 }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-navy)", opacity: 0.2 }}
              interval={0}
            />
            <YAxis
              width={36}
              tick={{ fontSize: 10, fill: "var(--color-navy)", opacity: 0.55 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => signed(v)}
            />
            <ReferenceLine y={0} stroke="var(--color-navy)" strokeOpacity={0.45} />
            <Tooltip
              cursor={{ fill: "var(--color-steel)", fillOpacity: 0.12 }}
              animationDuration={350}
              animationEasing="ease-out"
              contentStyle={{ borderRadius: 8, border: "1px solid var(--color-navy)", fontSize: 12, padding: "4px 8px" }}
              formatter={(value, name) => [signed(value as number), name]}
              itemSorter={(item) => ORDER.indexOf(String(item.dataKey))}
            />
            <Bar dataKey="offense" name={labels.offense} stackId="runs" fill="var(--color-brick)" {...anim} />
            <Bar dataKey="prevention" name={labels.prevention} stackId="runs" fill="var(--color-navy)" {...anim} />
            <Line
              dataKey="net"
              name={labels.net}
              stroke="none"
              dot={{ r: 5, fill: "var(--color-lava)", stroke: "var(--color-papaya)", strokeWidth: 1.5 }}
              activeDot={{ r: 6, fill: "var(--color-lava)", stroke: "var(--color-papaya)", strokeWidth: 2 }}
              {...anim}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </WhenInView>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-navy/65">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brick" aria-hidden />
          {labels.offense}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-navy" aria-hidden />
          {labels.prevention}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-lava" aria-hidden />
          {labels.net}
        </li>
      </ul>
    </div>
  );
}
