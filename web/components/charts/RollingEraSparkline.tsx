"use client";

import { useTranslations } from "next-intl";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RollingEraPoint } from "@/lib/pitching-form";

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
export default function RollingEraSparkline({
  data,
}: {
  data: RollingEraPoint[];
}) {
  const t = useTranslations("Overview");
  if (data.length === 0) return null;

  return (
    <div className="rounded-lg border border-navy/10 bg-white/50 p-4">
      <h3 className="text-sm font-semibold text-navy">{t("rollingEraTitle")}</h3>
      <p className="mt-0.5 text-xs text-navy/45">{t("rollingEraNote")}</p>
      <div className="mt-2 h-[96px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <XAxis dataKey="date" hide />
            <YAxis
              hide
              domain={[
                (min: number) => Math.max(0, min - 0.5),
                (max: number) => max + 0.5,
              ]}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-steel)", strokeWidth: 1 }}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--color-navy)",
                fontSize: 12,
                padding: "4px 8px",
              }}
              labelFormatter={(label) => fmtDate(String(label))}
              formatter={(value) => [(value as number).toFixed(2), "ERA"]}
            />
            <Line
              type="monotone"
              dataKey="era"
              stroke="var(--color-brick)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
