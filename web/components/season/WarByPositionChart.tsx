"use client";

// P12 M5: team WAR by position group (C … DH, SP, RP), this season brick vs the
// prior season steel (D8). Grouping rules live in lib/team-season.ts
// (positionGroup): batters by primary position, pitchers SP / RP by start share.

import { useReducedMotion } from "motion/react";
import { Bar, BarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import WhenInView from "@/components/motion/WhenInView";

export default function WarByPositionChart({
  data,
  season,
  priorSeason,
}: {
  data: { group: string; a: number; b: number | null }[];
  season: number;
  priorSeason: number | null;
}) {
  const reduce = useReducedMotion();
  const anim = { isAnimationActive: !reduce, animationDuration: 800, animationEasing: "ease-out" as const };
  return (
    <WhenInView className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
          <XAxis
            dataKey="group"
            tick={{ fontSize: 11, fill: "var(--color-navy)", opacity: 0.7 }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-navy)", opacity: 0.2 }}
            interval={0}
          />
          <YAxis
            width={30}
            tick={{ fontSize: 10, fill: "var(--color-navy)", opacity: 0.55 }}
            tickLine={false}
            axisLine={false}
          />
          <ReferenceLine y={0} stroke="var(--color-navy)" strokeOpacity={0.35} />
          <Tooltip
            cursor={{ fill: "var(--color-steel)", fillOpacity: 0.12 }}
            animationDuration={350}
            animationEasing="ease-out"
            contentStyle={{ borderRadius: 8, border: "1px solid var(--color-navy)", fontSize: 12, padding: "4px 8px" }}
            formatter={(value, name) => [
              value == null ? "—" : (value as number).toFixed(1),
              `WAR ${name === "b" ? priorSeason : season}`,
            ]}
          />
          <Bar dataKey="a" fill="var(--color-brick)" radius={[2, 2, 0, 0]} {...anim} />
          {priorSeason != null && <Bar dataKey="b" fill="var(--color-steel)" radius={[2, 2, 0, 0]} {...anim} />}
        </BarChart>
      </ResponsiveContainer>
    </WhenInView>
  );
}
