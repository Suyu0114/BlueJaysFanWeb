"use client";

// P13: small multiples — one metric per chart, the Jays (brick, dots) against
// the MLB average of the same season (navy dashed), so a league-wide shift
// (2023's rule changes) reads as the league moving, not the Jays. The tooltip
// adds the Jays' 30-club rank. Numbers come from lib/team-grid.ts; each chart
// is its own PNG (Exportable exports the largest <svg> inside it). Straight
// segments, not monotone curves: five seasons are five points, and a smoothed
// line would invent in-between values.

import { useLocale, useTranslations } from "next-intl";
import { useReducedMotion } from "motion/react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Exportable from "@/components/Exportable";
import WhenInView from "@/components/motion/WhenInView";
import { ordinal } from "@/lib/ordinal";
import type { TrendItem, TrendPoint } from "@/lib/team-grid";
import { formatMetric, METRIC, metricLabel, type MetricFormat } from "@/lib/team-metrics";

function tick(v: number, format: MetricFormat): string {
  // One decimal so close ticks (8.5% / 9%) never print twice; drop a bare ".0".
  if (format === "pct1") return `${(100 * v).toFixed(1).replace(/\.0$/, "")}%`;
  if (format === "rate3") return formatMetric(v, "rate3");
  // Only the decimals the tick needs (4 / 4.2 / 4.25): a fixed toFixed(1) would
  // print a 0.25-step tick as a misleading "4.3".
  if (format === "dec2") return String(Number(v.toFixed(2)));
  return Math.round(v).toString();
}

// Round ticks in DISPLAY units (8.5% not 0.085; .310 not 0.31), stepping by 1 /
// 2 / 2.5 / 5 × 10^k so there are about three gaps — Recharts' own "auto" ticks
// land on values like 5.5% / 6.6% / 7.7% for fractions.
const SCALE: Record<MetricFormat, number> = { pct1: 100, rate3: 1000, dec2: 1, dec1: 1, int: 1, signed: 1 };

function niceTicks(values: number[], format: MetricFormat): number[] {
  const scale = SCALE[format];
  const lo = Math.min(...values) * scale;
  const hi = Math.max(...values) * scale;
  const raw = (hi - lo || Math.abs(hi) * 0.1 || 1) / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const ticks: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + step / 2; v += step) {
    ticks.push(Number((v / scale).toPrecision(12)));
  }
  return ticks;
}

export default function TrendSmallMultiples({ items, span }: { items: TrendItem[]; span: string }) {
  const t = useTranslations("Team");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const anim = { isAnimationActive: !reduce, animationDuration: 900, animationEasing: "ease-out" as const };

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-navy/65">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-brick" aria-hidden />
          {t("trendsJays")}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2 border-dashed border-navy/70" aria-hidden />
          {t("trendsMlb")}
        </li>
      </ul>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => {
          const def = METRIC[item.key];
          const label = metricLabel(def, t);
          const values = item.points.flatMap((p) => [p.jays, p.mlb]).filter((v): v is number => v != null);
          const ticks = values.length ? niceTicks(values, def.format) : undefined;
          return (
            <div key={item.key} className="rounded-md border border-navy/10 bg-papaya/50 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-sm font-semibold text-navy">{label}</h4>
                <span className="text-[10px] text-navy/50">
                  {def.direction === "lower" ? t("lowerBetter") : t("higherBetter")}
                </span>
              </div>
              <Exportable name={`blue jays ${label} ${span}`} caption={`Blue Jays · ${label} · ${span} · ${t("trendsMlb")}`}>
                <WhenInView className="mt-1 h-[140px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={item.points} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
                      <XAxis
                        dataKey="season"
                        tick={{ fontSize: 10, fill: "var(--color-navy)", opacity: 0.6 }}
                        tickLine={false}
                        axisLine={{ stroke: "var(--color-navy)", opacity: 0.2 }}
                        interval={0}
                        padding={{ left: 10, right: 10 }}
                      />
                      <YAxis
                        width={38}
                        domain={ticks ? [ticks[0], ticks[ticks.length - 1]] : ["auto", "auto"]}
                        ticks={ticks}
                        tick={{ fontSize: 10, fill: "var(--color-navy)", opacity: 0.55 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => tick(v, def.format)}
                      />
                      <Tooltip
                        cursor={{ stroke: "var(--color-steel)", strokeWidth: 1 }}
                        animationDuration={350}
                        animationEasing="ease-out"
                        content={({ active, payload }) => {
                          const p = active ? (payload?.[0]?.payload as TrendPoint | undefined) : undefined;
                          if (!p) return null;
                          return (
                            <div className="rounded-lg border border-navy bg-white px-2 py-1 text-xs text-navy">
                              <div className="font-semibold">{p.season}</div>
                              <div>
                                {t("trendsJays")} {formatMetric(p.jays, def.format)}
                                {p.rank != null && (
                                  <span className="text-navy/60"> · {ordinal(p.rank, locale, p.tied)}</span>
                                )}
                              </div>
                              <div className="text-navy/60">
                                {t("trendsMlb")} {formatMetric(p.mlb, def.format)}
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Line
                        type="linear"
                        dataKey="mlb"
                        stroke="var(--color-navy)"
                        strokeOpacity={0.7}
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                        dot={false}
                        activeDot={false}
                        {...anim}
                      />
                      <Line
                        type="linear"
                        dataKey="jays"
                        stroke="var(--color-brick)"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "var(--color-brick)", strokeWidth: 0 }}
                        activeDot={{ r: 4.5, fill: "var(--color-brick)", stroke: "var(--color-papaya)", strokeWidth: 2 }}
                        {...anim}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </WhenInView>
              </Exportable>
            </div>
          );
        })}
      </div>
    </div>
  );
}
