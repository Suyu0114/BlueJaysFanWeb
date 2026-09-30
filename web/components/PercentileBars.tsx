"use client";

// P12 M6: Savant-style percentile rankings (0–100, 100 = best for every metric —
// Savant orients K%, BB%, Chase% … to the player's role already). The bar colour
// runs steel (low) -> neutral -> brick (high), mixed from brand tokens with CSS
// color-mix, so no new hex is introduced. A season with no row means "not
// qualified" (P12 D6), never 0. Values are MLB-wide season numbers (every club).
// Batters also get the luck line: wOBA vs xwOBA plus the official Barrel%.

import { useRef, useState } from "react";
import { motion, useInView } from "motion/react";
import { ENTER, SPRING_SOFT } from "@/lib/motion";
import type { PercentileRow, SavantSeason } from "@/lib/savant";

type MetricKey = Exclude<keyof PercentileRow, "season" | "role">;

// All strings come in from the server page (translated); per-season sentences
// (not qualified, luck) are pre-rendered there because they carry numbers.
export type PercentileLabels = {
  title: string;
  subtitle: string; // scope note: "all MLB clubs · 100 = best"
  season: string; // aria label of the season switch
  groups: Record<string, string>;
  metrics: Record<MetricKey, string>;
};

const GROUPS: Record<"batter" | "pitcher", { key: string; metrics: MetricKey[] }[]> = {
  batter: [
    { key: "quality", metrics: ["xwoba", "xba", "xslg", "exit_velocity", "brl_percent", "hard_hit_percent"] },
    { key: "discipline", metrics: ["k_percent", "bb_percent", "whiff_percent", "chase_percent"] },
    { key: "swing", metrics: ["bat_speed", "squared_up_rate"] },
    { key: "field", metrics: ["sprint_speed", "oaa", "arm_strength"] },
  ],
  pitcher: [
    { key: "allowed", metrics: ["xwoba", "xera", "xba", "exit_velocity", "brl_percent", "hard_hit_percent"] },
    { key: "missing", metrics: ["k_percent", "bb_percent", "whiff_percent", "chase_percent"] },
    { key: "stuff", metrics: ["fb_velocity", "fb_spin", "curve_spin"] },
  ],
};

// Below this, wOBA vs xwOBA is noise (a 3-PA "bad luck" gap means nothing).
const LUCK_MIN_PA = 100;

const r3 = (v: number) => {
  const s = v.toFixed(3);
  return s.startsWith("0.") ? s.slice(1) : s.startsWith("-0.") ? `-${s.slice(2)}` : s;
};

// Savant's scale runs blue -> grey -> red so that 50 reads as "average". Built
// from brand tokens only: steel -> a neutral (navy washed into papaya) -> brick.
const NEUTRAL = "color-mix(in srgb, var(--color-navy) 28%, var(--color-papaya))";
function scaleColor(v: number): string {
  return v <= 50
    ? `color-mix(in srgb, var(--color-steel) ${100 - 2 * v}%, ${NEUTRAL})`
    : `color-mix(in srgb, var(--color-brick) ${2 * v - 100}%, ${NEUTRAL})`;
}

function Bar({ value, animate }: { value: number; animate: boolean }) {
  const color = scaleColor(value);
  // Mid-range circles sit on the pale neutral: dark text there, light elsewhere.
  const text = value >= 30 && value <= 70 ? "text-navy" : "text-papaya";
  return (
    <div className="relative h-2 flex-1 rounded-full bg-navy/10">
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ background: color }}
        initial={{ width: "0%" }}
        animate={{ width: animate ? `${value}%` : "0%" }}
        transition={SPRING_SOFT}
      />
      <motion.span
        className={`absolute top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-papaya text-[10px] font-semibold ${text}`}
        style={{ background: color }}
        initial={{ left: "0%", opacity: 0 }}
        animate={{ left: animate ? `${value}%` : "0%", opacity: animate ? 1 : 0 }}
        transition={{ ...SPRING_SOFT, opacity: ENTER }}
      >
        {value}
      </motion.span>
    </div>
  );
}

export default function PercentileBars({
  role,
  rows,
  seasons,
  savant,
  labels,
  notQualifiedFor,
  luckText,
}: {
  role: "batter" | "pitcher";
  rows: PercentileRow[]; // this role only
  seasons: number[]; // newest first
  savant?: SavantSeason[]; // batters: wOBA / xwOBA / Barrel%
  labels: PercentileLabels;
  notQualifiedFor: Record<number, string>; // season -> sentence
  luckText: Record<number, string>; // season -> sentence (batters)
}) {
  const [season, setSeason] = useState(seasons[0]);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });
  const row = rows.find((r) => r.season === season);
  const sv = savant?.find((s) => s.season === season);

  return (
    <div ref={ref} className="rounded-lg border border-navy/10 bg-white/50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-navy">
          {labels.title} <span className="font-normal text-navy/45">· {labels.subtitle}</span>
        </h3>
        {seasons.length > 1 && (
          <div className="flex gap-1" role="tablist" aria-label={labels.season}>
            {seasons.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={s === season}
                onClick={() => setSeason(s)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  s === season ? "border-navy bg-navy text-papaya" : "border-steel/40 text-navy/70 hover:border-steel hover:text-navy"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {role === "batter" && sv && sv.woba != null && sv.xwoba != null && (sv.pa ?? 0) >= LUCK_MIN_PA && (
        <div className="mt-3 rounded-md border border-steel/20 bg-papaya/50 px-3 py-2 text-sm">
          <div className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums text-navy">
            <span>wOBA <b>{r3(sv.woba)}</b></span>
            <span>xwOBA <b>{r3(sv.xwoba)}</b></span>
            {sv.brl_percent != null && <span>Barrel% <b>{sv.brl_percent.toFixed(1)}%</b></span>}
          </div>
          <p className="mt-0.5 text-xs text-navy/60">{luckText[season]}</p>
        </div>
      )}

      {!row ? (
        <p className="mt-3 text-sm text-navy/55">{notQualifiedFor[season]}</p>
      ) : (
        <div className="mt-3 grid gap-x-8 gap-y-4 md:grid-cols-2">
          {GROUPS[role].map((g) => {
            const present = g.metrics.filter((m) => row[m] != null);
            if (present.length === 0) return null;
            return (
              <div key={g.key}>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-navy/45">{labels.groups[g.key]}</div>
                <div className="space-y-2.5">
                  {present.map((m) => (
                    <div key={m} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 text-xs text-navy/75">{labels.metrics[m]}</span>
                      <Bar value={row[m] as number} animate={inView} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
