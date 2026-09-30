"use client";

// P13 module ④: games above .500 by game number, every season in the window on
// one chart. One season is highlighted (brick, on top); the rest stay faint
// steel for context. The chips — which also carry each season's final record —
// or a click on a line pick the highlight. Series come from P12's pure
// gamesAboveSeries, merged by game number with lib/season-deltas.ts
// mergeByGame (the N-season form of the M5/M4 overlay). Recharts under
// WhenInView; reduced motion respected.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useReducedMotion } from "motion/react";
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Exportable from "@/components/Exportable";
import ScorecardFrame from "@/components/ScorecardFrame";
import SlidingPill from "@/components/motion/SlidingPill";
import WhenInView from "@/components/motion/WhenInView";

export type TrajectorySeason = { season: number; key: string; record: string; lastIndex: number };
export type TrajectoryRow = { game: number } & Record<string, number | null>;

const signed = (v: number) => (v > 0 ? `+${v}` : v === 0 ? "0" : `−${Math.abs(v)}`);
const X_TICKS = [1, 27, 54, 81, 108, 135, 162];

export default function SeasonTrajectoryChart({
  rows,
  seasons,
  initial,
  exportName,
  exportCaption,
}: {
  rows: TrajectoryRow[];
  seasons: TrajectorySeason[]; // oldest -> newest
  initial: number;
  exportName: string; // PNG file name; the PNG button wraps the chart only, not the chips
  exportCaption: string;
}) {
  const t = useTranslations("Team");
  const reduce = useReducedMotion();
  const [selected, setSelected] = useState(initial);
  // Faint seasons first, the highlighted one last so it draws on top.
  const ordered = [...seasons.filter((s) => s.season !== selected), ...seasons.filter((s) => s.season === selected)];

  // Y ticks every 10 games around the data: Recharts' own ticks for a custom
  // domain came out uneven (+30 / +25 / +10 / −5).
  const values = rows.flatMap((r) => seasons.map((s) => r[s.key])).filter((v): v is number => v != null);
  const lo = Math.floor((Math.min(0, ...values) - 2) / 10) * 10;
  const hi = Math.ceil((Math.max(0, ...values) + 2) / 10) * 10;
  const yTicks = Array.from({ length: (hi - lo) / 10 + 1 }, (_, i) => lo + 10 * i);

  return (
    <div>
      <ScorecardFrame seedKey="team-trajectory-pick" variant="control" className="w-fit max-w-full text-xs">
        <div role="radiogroup" aria-label={t("pickSeason")} className="relative z-10 flex flex-wrap p-1">
          {seasons.map((s) => {
            const active = s.season === selected;
            return (
              <button
                key={s.season}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSelected(s.season)}
                className={`relative whitespace-nowrap px-2.5 py-1 font-medium tabular-nums transition-colors ${
                  active ? "text-papaya" : "text-navy/65 hover:text-navy"
                }`}
              >
                {active && <SlidingPill group="team-trajectory-pick" />}
                <span className="relative z-10">
                  {s.season} · {s.record}
                </span>
              </button>
            );
          })}
        </div>
      </ScorecardFrame>

      <Exportable name={exportName} caption={exportCaption} className="mt-3">
      <WhenInView className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 10, right: 40, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="game"
              type="number"
              domain={[1, 162]}
              ticks={X_TICKS}
              tick={{ fontSize: 10, fill: "var(--color-navy)", opacity: 0.55 }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-navy)", opacity: 0.2 }}
            />
            <YAxis
              width={36}
              allowDecimals={false}
              // Hug the data — Recharts' auto domain left a third of the chart empty above a +26 peak.
              domain={[lo, hi]}
              ticks={yTicks}
              tick={{ fontSize: 10, fill: "var(--color-navy)", opacity: 0.55 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => signed(v)}
            />
            <ReferenceLine y={0} stroke="var(--color-navy)" strokeOpacity={0.45} />
            <Tooltip
              cursor={{ stroke: "var(--color-steel)", strokeWidth: 1 }}
              animationDuration={350}
              animationEasing="ease-out"
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const items = [...payload].sort((a, b) => String(a.dataKey).localeCompare(String(b.dataKey)));
                return (
                  <div className="rounded-lg border border-navy bg-white px-2 py-1 text-xs text-navy">
                    <div className="font-semibold">{t("gameLabel", { n: Number(label) })}</div>
                    {items.map((it) => {
                      const season = seasons.find((s) => s.key === it.dataKey);
                      if (!season || it.value == null) return null;
                      const on = season.season === selected;
                      return (
                        <div key={season.key} className={`tabular-nums ${on ? "font-semibold text-brick" : "text-navy/60"}`}>
                          {season.season} {signed(Number(it.value))}
                        </div>
                      );
                    })}
                  </div>
                );
              }}
            />
            {ordered.map((s) => {
              const on = s.season === selected;
              return (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  type="linear"
                  stroke={on ? "var(--color-brick)" : "var(--color-steel)"}
                  strokeOpacity={on ? 1 : 0.4}
                  strokeWidth={on ? 2.5 : 1.5}
                  dot={false}
                  activeDot={on ? { r: 4, fill: "var(--color-brick)", stroke: "var(--color-papaya)", strokeWidth: 2 } : false}
                  connectNulls
                  isAnimationActive={!reduce}
                  animationDuration={1000}
                  animationEasing="ease-out"
                  onClick={() => setSelected(s.season)}
                  style={{ cursor: "pointer" }}
                  label={(p: { x?: number | string; y?: number | string; index?: number }) =>
                    p.index === s.lastIndex ? (
                      <text
                        x={Number(p.x) + 5}
                        y={Number(p.y)}
                        dy={3.5}
                        fontSize={10}
                        fill={on ? "var(--color-brick)" : "var(--color-steel)"}
                        fontWeight={on ? 700 : 400}
                      >
                        {s.season}
                      </text>
                    ) : (
                      <g />
                    )
                  }
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </WhenInView>
      </Exportable>
    </div>
  );
}
