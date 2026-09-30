"use client";

// P12 M5: a team-season line by GAME NUMBER — games above .500 or cumulative run
// differential — with the prior season dashed steel under the current brick
// line (D8), and a zero reference so "above / below water" reads at a glance.
// Points come from lib/team-season.ts series merged by lib/season-deltas.ts
// overlayByGame. Drawn on scroll-in (WhenInView).

import { useReducedMotion } from "motion/react";
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import WhenInView from "@/components/motion/WhenInView";
import type { OverlayPoint } from "@/lib/season-deltas";

const signed = (v: number) => (v > 0 ? `+${v}` : v === 0 ? "0" : `−${Math.abs(v)}`);

function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export default function SeasonTrendChart({
  points,
  season,
  priorSeason,
  labels,
}: {
  points: OverlayPoint[];
  season: number;
  priorSeason: number | null;
  labels: { game: string };
}) {
  const reduce = useReducedMotion();
  if (points.length === 0) return null;
  const byGame = new Map(points.map((p) => [p.game, p]));
  const anim = { isAnimationActive: !reduce, animationDuration: 1100, animationEasing: "ease-out" as const };

  return (
    <WhenInView className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="game"
            type="number"
            domain={[1, "dataMax"]}
            ticks={[1, 27, 54, 81, 108, 135, 162]}
            tick={{ fontSize: 10, fill: "var(--color-navy)", opacity: 0.55 }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-navy)", opacity: 0.2 }}
          />
          <YAxis
            width={34}
            tick={{ fontSize: 10, fill: "var(--color-navy)", opacity: 0.55 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => signed(v)}
          />
          <ReferenceLine y={0} stroke="var(--color-navy)" strokeOpacity={0.35} />
          <Tooltip
            cursor={{ stroke: "var(--color-steel)", strokeWidth: 1 }}
            animationDuration={350}
            animationEasing="ease-out"
            itemSorter={(item) => (item.dataKey === "value" ? 0 : 1)}
            contentStyle={{ borderRadius: 8, border: "1px solid var(--color-navy)", fontSize: 12, padding: "4px 8px" }}
            labelFormatter={(label) => {
              const date = byGame.get(Number(label))?.date;
              return `${labels.game} ${label}${date ? ` · ${fmtDate(date)}` : ""}`;
            }}
            formatter={(value, name) => [
              value == null ? "—" : signed(value as number),
              name === "prior" ? String(priorSeason) : String(season),
            ]}
          />
          {priorSeason != null && (
            <Line type="monotone" dataKey="prior" stroke="var(--color-steel)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls={false} {...anim} />
          )}
          <Line type="monotone" dataKey="value" stroke="var(--color-brick)" strokeWidth={2} dot={false} connectNulls={false} {...anim} />
        </LineChart>
      </ResponsiveContainer>
    </WhenInView>
  );
}
