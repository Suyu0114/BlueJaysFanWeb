"use client";

// Team value by position group (replaces P12 M5's WarByPositionChart). A metric
// switch (WAR / Off / HR / OPS) and three views: this season vs the prior one
// side by side (brick vs steel, D8); the change between them — one bar per
// group, grass = up and brick = down (the Δ-chip vocabulary of
// SeasonCompareCard); and, for HR / OPS only, vs MLB — the Jays minus the MLB
// average at that position (025 view), grass = above and brick = below, with
// the Jays' rank among 30 printed on each bar. The P13 rank tint is kept to the
// table underneath: there brick means 1st, which would contradict this chart's
// brick = worse within one panel.
// Higher is better for all four metrics. The allocation rules (PA share, PH ->
// DH, …) live in lib/team-season.ts (valueByPosition); this only draws.

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useReducedMotion } from "motion/react";
import { Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Exportable from "@/components/Exportable";
import ScorecardFrame from "@/components/ScorecardFrame";
import SlidingPill from "@/components/motion/SlidingPill";
import WhenInView from "@/components/motion/WhenInView";
import { ordinal } from "@/lib/ordinal";
import { BATTING_GROUPS, type PositionGroup, type PositionValue } from "@/lib/team-season";
import type { PositionVsMlb } from "@/lib/team-position";

export type PositionBar = { group: PositionGroup; a: PositionValue; b: PositionValue | null };

type Metric = "war" | "off" | "hr" | "ops";
type Mode = "compare" | "change" | "vsMlb";
export type PositionMetric = Metric;
export type PositionMode = Mode;

// Jargon: English in both locales.
const METRICS: { key: Metric; label: string }[] = [
  { key: "war", label: "WAR" },
  { key: "off", label: "Off" },
  { key: "hr", label: "HR" },
  { key: "ops", label: "OPS" },
];

const DIGITS: Record<Metric, number> = { war: 1, off: 1, hr: 0, ops: 3 };
// vs MLB: the MLB HR reference is a per-club mean (17.0, 15.2), so one decimal.
const VS_MLB_DIGITS: Record<Metric, number> = { ...DIGITS, hr: 1 };

/** The metrics with an MLB-by-position reference (the 025 view has no WAR / Off). */
const hasMlbReference = (m: Metric): m is "hr" | "ops" => m === "hr" || m === "ops";

// Display format: typographic minus, OPS without the leading zero (.822), and
// a "+" when `signed` (Off is runs above average; every change is signed).
function fmt(metric: Metric, v: number, signed = false, digits = DIGITS[metric]): string {
  const r = Number(v.toFixed(digits));
  let s = Math.abs(r).toFixed(digits);
  if (metric === "ops") s = s.replace(/^0(?=\.)/, "");
  return (r < 0 ? "−" : signed && r > 0 ? "+" : "") + s;
}

const valueOf = (v: PositionValue | null, m: Metric) => (v == null ? null : v[m]);
// A change that rounds to zero at display precision is flat: shown, never coloured.
const isFlat = (d: number, digits: number) => Number(d.toFixed(digits)) === 0;

const deltaFill = (d: number | null, digits: number) =>
  d == null || isFlat(d, digits) ? "var(--color-navy)" : d > 0 ? "var(--color-grass)" : "var(--color-brick)";
const deltaOpacity = (d: number | null, digits: number) => (d == null || isFlat(d, digits) ? 0.25 : 1);

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
  vsMlb,
  initialMetric = "war",
  initialMode = "compare",
}: {
  data: PositionBar[];
  season: number;
  priorSeason: number | null; // null = no prior player data: the change view is hidden
  vsMlb: PositionVsMlb[]; // [] = no MLB-by-position rows: the vs MLB view is hidden
  initialMetric?: PositionMetric; // article figures open on the metric the text discusses
  initialMode?: PositionMode;
}) {
  const t = useTranslations("Season");
  const locale = useLocale();
  const reduce = useReducedMotion();
  // An article can show this chart twice: each instance needs its own pill groups.
  const uid = useId();
  const [metric, setMetricState] = useState<Metric>(initialMetric);
  const [modeState, setMode] = useState<Mode>(initialMode);
  const canVsMlb = vsMlb.length > 0 && hasMlbReference(metric);
  const mode: Mode =
    (modeState === "change" && priorSeason == null) || (modeState === "vsMlb" && !canVsMlb) ? "compare" : modeState;
  const metricLabel = METRICS.find((m) => m.key === metric)!.label;

  // vs MLB has no WAR / Off reference: switching to them falls back to the
  // side-by-side view (and stays there when switching back).
  const setMetric = (m: Metric) => {
    setMetricState(m);
    if (!hasMlbReference(m) && modeState === "vsMlb") setMode("compare");
  };

  // WAR covers pitchers too (SP / RP); the batting metrics only C … DH.
  const shown = metric === "war" ? data : data.filter((d) => BATTING_GROUPS.includes(d.group));
  const rows = shown.map((d) => {
    const a = valueOf(d.a, metric);
    const b = valueOf(d.b, metric);
    return { group: d.group, a, b, d: a != null && b != null ? a - b : null, paA: d.a.pa, paB: d.b?.pa ?? null };
  });

  // vs MLB: every number straight from the 025 view (Jays − MLB at that position).
  const vsDigits = VS_MLB_DIGITS[metric];
  const vsRows = hasMlbReference(metric)
    ? vsMlb.map((r) => {
        const jays = r.jays[metric];
        const mlb = r.mlb[metric];
        return {
          group: r.group,
          v: jays != null && mlb != null ? jays - mlb : null,
          jays,
          mlb,
          pa: r.jays.pa,
          rank: metric === "hr" ? r.jays.hr_rank : r.jays.ops_rank,
          tied: metric === "hr" ? r.jays.hr_tied : r.jays.ops_tied,
        };
      })
    : [];
  type VsRow = (typeof vsRows)[number];
  const chartData: ((typeof rows)[number] | VsRow)[] = mode === "vsMlb" ? vsRows : rows;

  const total = (side: "a" | "b") =>
    shown.reduce((sum, d) => sum + (d[side] == null ? 0 : (valueOf(d[side], metric) ?? 0)), 0);
  const totalKey = { war: "posTotalWar", off: "posTotalOff", hr: "posTotalHr" } as const;
  const totalLine =
    mode === "vsMlb"
      ? t("posVsMlbHint")
      : metric === "ops"
        ? null
        : t(totalKey[metric], {
            total: fmt(metric, total("a"), metric === "off"),
            prior:
              priorSeason != null
                ? t("posPriorTotal", { season: priorSeason, total: fmt(metric, total("b"), metric === "off") })
                : "",
          });

  const signed = mode !== "compare" || metric === "off";
  const digits = mode === "vsMlb" ? vsDigits : DIGITS[metric];
  const anim = { isAnimationActive: !reduce, animationDuration: 800, animationEasing: "ease-out" as const };
  const paNote = (pa: number | null) => (pa ? ` · ${t("posPa", { pa })}` : "");
  const swatch = (cls: string) => <span className={`inline-block h-2.5 w-2.5 rounded-sm ${cls}`} aria-hidden />;

  const modeOptions: { key: Mode; label: string }[] = [
    { key: "compare", label: priorSeason != null ? `${season} vs ${priorSeason}` : String(season) },
    ...(priorSeason != null ? [{ key: "change" as const, label: t("posModeChange") }] : []),
    ...(canVsMlb ? [{ key: "vsMlb" as const, label: t("posModeVsMlb") }] : []),
  ];

  const caption = [
    "Blue Jays",
    t("posCaption", { metric: metricLabel }),
    mode === "change"
      ? t("posCaptionChange", { season, prior: priorSeason! })
      : mode === "vsMlb"
        ? t("posCaptionVsMlb", { season })
        : priorSeason != null
          ? `${season} vs ${priorSeason}`
          : String(season),
  ].join(" · ");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented group={`season-pos-metric${uid}`} label={t("posMetric")} options={METRICS} value={metric} onChange={setMetric} />
        {modeOptions.length > 1 && (
          <Segmented group={`season-pos-mode${uid}`} label={t("posMode")} options={modeOptions} value={mode} onChange={setMode} />
        )}
      </div>

      {(priorSeason != null || mode === "vsMlb") && (
        <div className="mt-2 flex items-center gap-2 text-xs text-navy/55">
          {mode === "compare" ? (
            <>
              {swatch("bg-brick")}
              {season}
              {swatch("bg-steel")}
              {priorSeason}
            </>
          ) : mode === "change" ? (
            <>
              {swatch("bg-grass")}
              {t("posUp", { prior: priorSeason! })}
              {swatch("bg-brick")}
              {t("posDown", { prior: priorSeason! })}
            </>
          ) : (
            <>
              {swatch("bg-grass")}
              {t("posAboveMlb")}
              {swatch("bg-brick")}
              {t("posBelowMlb")}
            </>
          )}
        </div>
      )}

      <Exportable
        name={`blue jays ${metric} by position ${season}${
          mode === "change" ? ` change vs ${priorSeason}` : mode === "vsMlb" ? " vs mlb" : ""
        }`}
        caption={caption}
        className="mt-1"
      >
        <WhenInView className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              key={`${metric}-${mode}`}
              data={chartData}
              // vs MLB: extra top room so the rank over the tallest bar clears the PNG button
              margin={{ top: mode === "vsMlb" ? 28 : 8, right: 8, bottom: 0, left: 0 }}
              barGap={2}
            >
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
                allowDecimals={metric !== "hr" || mode === "vsMlb"}
                // whole-number HR ticks stay whole (+8, not +8.0) even where the values carry a decimal
                tickFormatter={(v: number) => fmt(metric, v, signed, metric === "hr" && Number.isInteger(v) ? 0 : digits)}
                // room for the rank printed past each bar's end
                padding={mode === "vsMlb" ? { top: 14, bottom: 14 } : undefined}
              />
              <ReferenceLine y={0} stroke="var(--color-navy)" strokeOpacity={0.35} />
              {mode === "vsMlb" ? (
                <Tooltip
                  cursor={{ fill: "var(--color-steel)", fillOpacity: 0.12 }}
                  animationDuration={350}
                  animationEasing="ease-out"
                  content={({ active, payload }) => {
                    const p = active ? (payload?.[0]?.payload as VsRow | undefined) : undefined;
                    if (!p) return null;
                    return (
                      <div className="rounded-lg border border-navy bg-white px-2 py-1 text-xs leading-snug text-navy">
                        <div className="font-semibold">{p.group}</div>
                        <div>
                          {t("posTipJays", { value: p.jays == null ? "—" : fmt(metric, p.jays, false, DIGITS[metric]) })}
                          {p.rank != null && ` · ${ordinal(p.rank, locale, p.tied)}`}
                          {paNote(p.pa)}
                        </div>
                        <div className="text-navy/65">
                          {t("posTipMlb", { value: p.mlb == null ? "—" : fmt(metric, p.mlb, false, vsDigits) })}
                        </div>
                        <div>{p.v == null ? "—" : t("posTipDiff", { value: fmt(metric, p.v, true, vsDigits) })}</div>
                      </div>
                    );
                  }}
                />
              ) : (
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
              )}
              {/* Flat conditionals, not a fragment: Recharts reads its direct children. */}
              {mode === "vsMlb" && (
                <Bar dataKey="v" radius={[2, 2, 0, 0]} {...anim}>
                  {vsRows.map((r) => (
                    <Cell key={r.group} fill={deltaFill(r.v, vsDigits)} fillOpacity={deltaOpacity(r.v, vsDigits)} />
                  ))}
                  {/* The Jays' MLB rank, past the end of each bar (above when ahead, below when behind). */}
                  <LabelList
                    dataKey="rank"
                    content={(props) => {
                      const r = vsRows[props.index ?? -1];
                      const box = props.viewBox as { x?: number; y?: number; width?: number; height?: number } | undefined;
                      if (!r || r.rank == null || !box || box.x == null || box.y == null) return null;
                      const top = Math.min(box.y, box.y + (box.height ?? 0));
                      const bottom = Math.max(box.y, box.y + (box.height ?? 0));
                      const below = r.v != null && r.v < 0;
                      return (
                        <text
                          x={box.x + (box.width ?? 0) / 2}
                          y={below ? bottom + 11 : top - 4}
                          textAnchor="middle"
                          fontSize={10}
                          fill="var(--color-navy)"
                          fillOpacity={0.75}
                        >
                          {ordinal(r.rank, locale, r.tied)}
                        </text>
                      );
                    }}
                  />
                </Bar>
              )}
              {mode === "change" && (
                <Bar dataKey="d" radius={[2, 2, 0, 0]} {...anim}>
                  {rows.map((r) => (
                    <Cell key={r.group} fill={deltaFill(r.d, DIGITS[metric])} fillOpacity={deltaOpacity(r.d, DIGITS[metric])} />
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
