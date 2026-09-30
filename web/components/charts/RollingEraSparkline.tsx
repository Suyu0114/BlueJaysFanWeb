"use client";

import { useTranslations } from "next-intl";
import { useReducedMotion } from "motion/react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import WhenInView from "@/components/motion/WhenInView";
import type { RollingEraPoint } from "@/lib/pitching-form";
import { overlayByGame } from "@/lib/season-deltas";

function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

// P10: trailing-5-appearance ERA trend (IP-weighted aggregate per window, see
// lib/pitching-form.ts::rollingEra). Mirrors RollingOpsSparkline, with one
// inverted mental model: a FALLING line is good — the note under the title says
// so, because fans read "line up = better" by default.
// P12 M4: optional `prior` season, dashed steel, on an APPEARANCE-NUMBER axis.
export default function RollingEraSparkline({
  data,
  prior,
  season,
  priorSeason,
}: {
  data: RollingEraPoint[];
  prior?: RollingEraPoint[];
  season?: number;
  priorSeason?: number;
}) {
  const t = useTranslations("Overview");
  const reduce = useReducedMotion();
  if (data.length === 0) return null;

  const hasPrior = (prior?.length ?? 0) > 0 && priorSeason != null;
  const points = overlayByGame(data, hasPrior ? prior : undefined, (p) => p.era);
  const byGame = new Map(points.map((p) => [p.game, p]));

  return (
    <div className="rounded-lg border border-navy/10 bg-white/50 p-4">
      <h3 className="text-sm font-semibold text-navy">{t("rollingEraTitle")}</h3>
      <p className="mt-0.5 text-xs text-navy/45">{t("rollingEraNote")}</p>
      {hasPrior && (
        <p className="mt-0.5 flex items-center gap-2 text-xs text-navy/50">
          <span className="inline-block h-0.5 w-4 bg-brick" aria-hidden />
          {season}
          <span className="inline-block w-4 border-t-2 border-dashed border-steel" aria-hidden />
          {priorSeason}
          <span>· {t("byOutingNumber")}</span>
        </p>
      )}
      {/* Mounted on scroll-in so the line visibly draws left → right. */}
      <WhenInView className="mt-2 h-[96px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <XAxis dataKey="game" type="number" domain={["dataMin", "dataMax"]} hide />
            <YAxis
              hide
              domain={[
                (min: number) => Math.max(0, min - 0.5),
                (max: number) => max + 0.5,
              ]}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-steel)", strokeWidth: 1 }}
              animationDuration={350}
              animationEasing="ease-out"
              // current season first, prior season second
              itemSorter={(item) => (item.dataKey === "value" ? 0 : 1)}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--color-navy)",
                fontSize: 12,
                padding: "4px 8px",
              }}
              labelFormatter={(label) => {
                const date = byGame.get(Number(label))?.date;
                return `${t("outingN", { n: Number(label) })}${date ? ` · ${fmtDate(date)}` : ""}`;
              }}
              formatter={(value, name) => [
                value == null ? "—" : (value as number).toFixed(2),
                hasPrior ? `ERA ${name === "prior" ? priorSeason : season}` : "ERA",
              ]}
            />
            {hasPrior && (
              <Line
                type="monotone"
                dataKey="prior"
                stroke="var(--color-steel)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                activeDot={{ r: 3, fill: "var(--color-steel)", stroke: "var(--color-papaya)", strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={!reduce}
                animationDuration={900}
                animationEasing="ease-out"
              />
            )}
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--color-brick)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "var(--color-brick)", stroke: "var(--color-papaya)", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={!reduce}
              animationDuration={900}
              animationEasing="ease-out"
            />
          </LineChart>
        </ResponsiveContainer>
      </WhenInView>
    </div>
  );
}
