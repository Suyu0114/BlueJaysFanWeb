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
import type { RollingOpsPoint } from "@/lib/batting-form";

// Baseball convention: ".308" / "1.002".
function ops3(v: number): string {
  const s = v.toFixed(3);
  return s.startsWith("0.") ? s.slice(1) : s;
}

function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

// P9: trailing-window OPS trend (default 15-game). The page hides this when the
// player has fewer games than the window (rollingOps returns []).
export default function RollingOpsSparkline({
  data,
}: {
  data: RollingOpsPoint[];
}) {
  const t = useTranslations("Overview");
  const reduce = useReducedMotion();
  if (data.length === 0) return null;

  return (
    <div className="rounded-lg border border-navy/10 bg-white/50 p-4">
      <h3 className="text-sm font-semibold text-navy">{t("rollingOpsTitle")}</h3>
      {/* Mounted on scroll-in so the line visibly draws left → right. */}
      <WhenInView className="mt-2 h-[96px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <XAxis dataKey="date" hide />
            <YAxis
              hide
              domain={[
                (min: number) => Math.max(0, min - 0.05),
                (max: number) => max + 0.05,
              ]}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-steel)", strokeWidth: 1 }}
              animationDuration={350}
              animationEasing="ease-out"
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--color-navy)",
                fontSize: 12,
                padding: "4px 8px",
              }}
              labelFormatter={(label) => fmtDate(String(label))}
              formatter={(value) => [ops3(value as number), "OPS"]}
            />
            <Line
              type="monotone"
              dataKey="ops"
              stroke="var(--color-brick)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "var(--color-brick)", stroke: "var(--color-papaya)", strokeWidth: 2 }}
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
