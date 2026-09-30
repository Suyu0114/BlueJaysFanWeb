"use client";

// P12 M3: the 2024–2026 arc as small multiples — one tiny line per stat, the two
// compared seasons highlighted (brick = focus season, steel = comparison, D8),
// each tick labelled with the clubs he played for. Values come from
// web_player_team_season_stats in the page's scope; a season with no line in
// that scope is a gap, not a zero. Drawn on scroll-in (WhenInView).

import { useReducedMotion } from "motion/react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import WhenInView from "@/components/motion/WhenInView";

export type ArcFormat = "rate3" | "int" | "dec1" | "dec2" | "pct";

export type ArcMetric = {
  key: string;
  label: string; // stat name, English
  format: ArcFormat;
  points: { season: number; value: number | null; club: string }[];
};

function fmt(v: number | null | undefined, format: ArcFormat): string {
  if (v == null || !Number.isFinite(v)) return "—";
  switch (format) {
    case "pct": return `${(v * 100).toFixed(1)}%`;
    case "int": return v.toFixed(0);
    case "dec1": return v.toFixed(1);
    case "dec2": return v.toFixed(2);
    default: { const s = v.toFixed(3); return s.startsWith("0.") ? s.slice(1) : s; }
  }
}

function dotColor(season: number, a: number, b: number): string {
  return season === a ? "var(--color-brick)" : season === b ? "var(--color-steel)" : "var(--color-navy)";
}

export default function SeasonArc({
  metrics,
  seasonA,
  seasonB,
}: {
  metrics: ArcMetric[];
  seasonA: number;
  seasonB: number;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {metrics.map((m) => {
        const data = m.points.map((p) => ({ ...p, label: String(p.season) }));
        const values = data.map((d) => d.value).filter((v): v is number => v != null);
        if (values.length === 0) return null;
        const lo = Math.min(...values);
        const hi = Math.max(...values);
        const pad = (hi - lo) * 0.25 || Math.abs(hi) * 0.1 || 1;
        return (
          <div key={m.key} className="rounded-md border border-steel/20 bg-white/50 p-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-navy/55">{m.label}</div>
            <WhenInView className="h-[110px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 14, right: 24, bottom: 0, left: 24 }}>
                  <XAxis
                    dataKey="label"
                    interval={0}
                    tickLine={false}
                    axisLine={{ stroke: "var(--color-navy)", opacity: 0.2 }}
                    height={30}
                    tick={(props: { x?: number | string; y?: number | string; payload?: { value: string; index: number } }) => {
                      const p = data[props.payload?.index ?? 0];
                      return (
                        <g transform={`translate(${Number(props.x ?? 0)},${Number(props.y ?? 0)})`}>
                          <text textAnchor="middle" dy={10} fontSize={10} fill="var(--color-navy)" fillOpacity={0.7}>
                            {props.payload?.value}
                          </text>
                          <text textAnchor="middle" dy={22} fontSize={9} fill="var(--color-navy)" fillOpacity={0.45}>
                            {p?.club ?? ""}
                          </text>
                        </g>
                      );
                    }}
                  />
                  <YAxis hide domain={[lo - pad, hi + pad]} />
                  <Tooltip
                    cursor={{ stroke: "var(--color-steel)", strokeWidth: 1 }}
                    animationDuration={350}
                    animationEasing="ease-out"
                    contentStyle={{ borderRadius: 8, border: "1px solid var(--color-navy)", fontSize: 12, padding: "4px 8px" }}
                    formatter={(value) => [fmt(value as number, m.format), m.label]}
                  />
                  <Line
                    type="linear"
                    dataKey="value"
                    stroke="var(--color-navy)"
                    strokeOpacity={0.35}
                    strokeWidth={1.5}
                    connectNulls={false}
                    isAnimationActive={!reduce}
                    animationDuration={700}
                    animationEasing="ease-out"
                    dot={(props: { cx?: number; cy?: number; index?: number; payload?: { season: number; value: number | null } }) => {
                      const s = props.payload?.season ?? 0;
                      if (props.cx == null || props.cy == null || props.payload?.value == null) {
                        return <g key={`d-${props.index}`} />;
                      }
                      const hot = s === seasonA || s === seasonB;
                      return (
                        <g key={`d-${props.index}`}>
                          <circle cx={props.cx} cy={props.cy} r={hot ? 4.5 : 3} fill={dotColor(s, seasonA, seasonB)} fillOpacity={hot ? 1 : 0.35} />
                          {hot && (
                            <text x={props.cx} y={props.cy - 8} textAnchor="middle" fontSize={10} fill="var(--color-navy)">
                              {fmt(props.payload.value, m.format)}
                            </text>
                          )}
                        </g>
                      );
                    }}
                    activeDot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </WhenInView>
          </div>
        );
      })}
    </div>
  );
}
