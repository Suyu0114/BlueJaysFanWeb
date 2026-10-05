"use client";

// Team value by position group (replaces P12 M5's WarByPositionChart). A metric
// switch (WAR / Off / HR / OPS) and two views: this season vs the prior one side
// by side (brick vs steel, D8), or the change between them — one bar per group,
// grass = up and brick = down (the Δ-chip vocabulary of SeasonCompareCard).
// Higher is better for all four metrics. The allocation rules (PA share, PH ->
// DH, …) live in lib/team-season.ts (valueByPosition); this only draws.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useReducedMotion } from "motion/react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Exportable from "@/components/Exportable";
import ScorecardFrame from "@/components/ScorecardFrame";
import SlidingPill from "@/components/motion/SlidingPill";
import WhenInView from "@/components/motion/WhenInView";
import { BATTING_GROUPS, type PositionGroup, type PositionValue } from "@/lib/team-season";

export type PositionBar = { group: PositionGroup; a: PositionValue; b: PositionValue | null };

type Metric = "war" | "off" | "hr" | "ops";
type Mode = "compare" | "change";

// Jargon: English in both locales.
const METRICS: { key: Metric; label: string }[] = [
  { key: "war", label: "WAR" },
  { key: "off", label: "Off" },
  { key: "hr", label: "HR" },
  { key: "ops", label: "OPS" },
];

const DIGITS: Record<Metric, number> = { war: 1, off: 1, hr: 0, ops: 3 };

// Display format: typographic minus, OPS without the leading zero (.822), and
// a "+" when `signed` (Off is runs above average; every change is signed).
function fmt(metric: Metric, v: number, signed = false): string {
  const digits = DIGITS[metric];
  const r = Number(v.toFixed(digits));
  let s = Math.abs(r).toFixed(digits);
  if (metric === "ops") s = s.replace(/^0(?=\.)/, "");
  return (r < 0 ? "−" : signed && r > 0 ? "+" : "") + s;
}

const valueOf = (v: PositionValue | null, m: Metric) => (v == null ? null : v[m]);
// A change that rounds to zero at display precision is flat: shown, never coloured.
const isFlat = (metric: Metric, d: number) => Number(d.toFixed(DIGITS[metric])) === 0;

function Segmented<T extends string>({
  group,
  label,
  options,
  value,
  onChange,
}: {
  group: string;
  label: string;
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <ScorecardFrame seedKey={group} variant="control" className="w-fit max-w-full text-xs">
      <div role="radiogroup" aria-label={label} className="relative z-10 flex flex-wrap p-1">
        {options.map((o) => {
          const active = o.key === value;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.key)}
              className={`relative whitespace-nowrap px-2.5 py-1 font-medium tabular-nums transition-colors ${
                active ? "text-papaya" : "text-navy/65 hover:text-navy"
              }`}
            >
              {active && <SlidingPill group={group} />}
              <span className="relative z-10">{o.label}</span>
            </button>
          );
        })}
      </div>
    </ScorecardFrame>
  );
}

export default function PositionValueChart({
  data,
  season,
  priorSeason,
}: {
  data: PositionBar[];
  season: number;
  priorSeason: number | null; // null = no prior player data: the change view is hidden
}) {
  const t = useTranslations("Season");
  const reduce = useReducedMotion();
  const [metric, setMetric] = useState<Metric>("war");
  const [modeState, setMode] = useState<Mode>("compare");
  const mode: Mode = priorSeason == null ? "compare" : modeState;
  const metricLabel = METRICS.find((m) => m.key === metric)!.label;

  // WAR covers pitchers too (SP / RP); the batting metrics only C … DH.
  const shown = metric === "war" ? data : data.filter((d) => BATTING_GROUPS.includes(d.group));
  const rows = shown.map((d) => {
    const a = valueOf(d.a, metric);
    const b = valueOf(d.b, metric);
    return { group: d.group, a, b, d: a != null && b != null ? a - b : null, paA: d.a.pa, paB: d.b?.pa ?? null };
  });

  const total = (side: "a" | "b") =>
    shown.reduce((sum, d) => sum + (d[side] == null ? 0 : (valueOf(d[side], metric) ?? 0)), 0);
  const totalKey = { war: "posTotalWar", off: "posTotalOff", hr: "posTotalHr" } as const;
  const totalLine =
    metric === "ops"
      ? null
      : t(totalKey[metric], {
          total: fmt(metric, total("a"), metric === "off"),
          prior:
            priorSeason != null
              ? t("posPriorTotal", { season: priorSeason, total: fmt(metric, total("b"), metric === "off") })
              : "",
        });

  const signed = mode === "change" || metric === "off";
  const anim = { isAnimationActive: !reduce, animationDuration: 800, animationEasing: "ease-out" as const };
  const paNote = (pa: number | null) => (pa ? ` · ${t("posPa", { pa })}` : "");
  const swatch = (cls: string) => <span className={`inline-block h-2.5 w-2.5 rounded-sm ${cls}`} aria-hidden />;

  const caption = [
    "Blue Jays",
    t("posCaption", { metric: metricLabel }),
    mode === "change"
      ? t("posCaptionChange", { season, prior: priorSeason! })
      : priorSeason != null
        ? `${season} vs ${priorSeason}`
        : String(season),
  ].join(" · ");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented group="season-pos-metric" label={t("posMetric")} options={METRICS} value={metric} onChange={setMetric} />
        {priorSeason != null && (
          <Segmented
            group="season-pos-mode"
            label={t("posMode")}
            options={[
              { key: "compare" as const, label: `${season} vs ${priorSeason}` },
              { key: "change" as const, label: t("posModeChange") },
            ]}
            value={mode}
            onChange={setMode}
          />
        )}
      </div>

      {priorSeason != null && (
        <div className="mt-2 flex items-center gap-2 text-xs text-navy/55">
          {mode === "compare" ? (
            <>
              {swatch("bg-brick")}
              {season}
              {swatch("bg-steel")}
              {priorSeason}
            </>
          ) : (
            <>
              {swatch("bg-grass")}
              {t("posUp", { prior: priorSeason })}
              {swatch("bg-brick")}
              {t("posDown", { prior: priorSeason })}
            </>
          )}
        </div>
      )}

      <Exportable
        name={`blue jays ${metric} by position ${season}${mode === "change" ? ` change vs ${priorSeason}` : ""}`}
        caption={caption}
        className="mt-1"
      >
        <WhenInView className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart key={`${metric}-${mode}`} data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
              <XAxis
                dataKey="group"
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
                allowDecimals={metric !== "hr"}
                tickFormatter={(v: number) => fmt(metric, v, signed)}
              />
              <ReferenceLine y={0} stroke="var(--color-navy)" strokeOpacity={0.35} />
              <Tooltip
                cursor={{ fill: "var(--color-steel)", fillOpacity: 0.12 }}
                animationDuration={350}
                animationEasing="ease-out"
                contentStyle={{ borderRadius: 8, border: "1px solid var(--color-navy)", fontSize: 12, padding: "4px 8px" }}
                formatter={(value, name, item) => {
                  const p = item.payload as (typeof rows)[number];
                  if (name === "d") {
                    return [value == null ? "—" : fmt(metric, value as number, true), `${metricLabel} ${priorSeason} → ${season}`];
                  }
                  const prior = name === "b";
                  const pa = metric === "war" ? null : prior ? p.paB : p.paA;
                  return [
                    value == null ? "—" : `${fmt(metric, value as number, signed)}${paNote(pa)}`,
                    `${metricLabel} ${prior ? priorSeason : season}`,
                  ];
                }}
              />
              {/* Flat conditionals, not a fragment: Recharts reads its direct children. */}
              {mode === "change" && (
                <Bar dataKey="d" radius={[2, 2, 0, 0]} {...anim}>
                  {rows.map((r) => (
                    <Cell
                      key={r.group}
                      fill={
                        r.d == null || isFlat(metric, r.d)
                          ? "var(--color-navy)"
                          : r.d > 0
                            ? "var(--color-grass)"
                            : "var(--color-brick)"
                      }
                      fillOpacity={r.d == null || isFlat(metric, r.d) ? 0.25 : 1}
                    />
                  ))}
                </Bar>
              )}
              {mode === "compare" && <Bar dataKey="a" fill="var(--color-brick)" radius={[2, 2, 0, 0]} {...anim} />}
              {mode === "compare" && priorSeason != null && (
                <Bar dataKey="b" fill="var(--color-steel)" radius={[2, 2, 0, 0]} {...anim} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </WhenInView>
      </Exportable>

      {totalLine && <p className="mt-2 text-[11px] leading-snug text-navy/55">{totalLine}</p>}
    </div>
  );
}
