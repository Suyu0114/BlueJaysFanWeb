"use client";

// P10: per-game average velocity of the primary fastball across the latest
// season — the "is he healthy / getting tired?" story. Reads release_speed
// only (release-frame, plate_alignment-agnostic). The explorer computes the
// points (lib/pitch-arsenal.ts::veloTrend) and hides this below 5 games.

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
import type { VeloTrendPoint } from "@/lib/pitch-arsenal";
import { colorFor } from "@/lib/pitch-colors";

function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export default function VeloTrendChart({
  data,
  pitchType,
}: {
  data: VeloTrendPoint[];
  pitchType: string;
}) {
  const reduce = useReducedMotion();
  if (data.length === 0) return null;

  return (
    // Mounted on scroll-in so the line visibly draws left → right.
    <WhenInView className="h-[140px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            tick={{ fontSize: 10, fill: "var(--color-navy)", opacity: 0.55 }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-navy)", opacity: 0.2 }}
            minTickGap={40}
          />
          <YAxis
            width={34}
            domain={[
              (min: number) => Math.floor(min - 1),
              (max: number) => Math.ceil(max + 1),
            ]}
            tick={{ fontSize: 10, fill: "var(--color-navy)", opacity: 0.55 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => v.toFixed(0)}
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
            formatter={(value) => [
              `${(value as number).toFixed(1)} mph`,
              pitchType,
            ]}
          />
          <Line
            type="monotone"
            dataKey="avgVelo"
            stroke={colorFor(pitchType)}
            strokeWidth={2}
            dot={{ r: 2.5, fill: colorFor(pitchType), strokeWidth: 0 }}
            activeDot={{ r: 4.5, fill: colorFor(pitchType), stroke: "var(--color-papaya)", strokeWidth: 2 }}
            isAnimationActive={!reduce}
            animationDuration={900}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </WhenInView>
  );
}
