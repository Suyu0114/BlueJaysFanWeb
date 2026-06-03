"use client";

import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

type Props = {
  batting: number;
  baserunning: number;
  fielding: number;
  positional: number;
  league: number;
  replacement: number;
  rar: number;
  war: number;
};

// Brand tokens only. §5.1 explicitly allows grass/dirt for THIS chart.
const COMPONENT_ORDER = [
  { key: "batting", labelKey: "compBatting", color: "var(--color-brick)" },
  { key: "baserunning", labelKey: "compBaserunning", color: "var(--color-steel)" },
  { key: "fielding", labelKey: "compFielding", color: "var(--color-grass)" },
  { key: "positional", labelKey: "compPositional", color: "var(--color-dirt)" },
  { key: "league", labelKey: "compLeague", color: "var(--color-lava)" },
  { key: "replacement", labelKey: "compReplacement", color: "var(--color-navy)" },
] as const;

function signed(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;
}

export default function WarBreakdown(props: Props) {
  const t = useTranslations("WarBreakdown");

  const values: Record<string, number> = {
    batting: props.batting,
    baserunning: props.baserunning,
    fielding: props.fielding,
    positional: props.positional,
    league: props.league,
    replacement: props.replacement,
  };

  // Single diverging stacked bar: positives stack up from 0, negatives down.
  const data = [{ label: t("rarLabel"), ...values }];

  // RPW is implied per row (rar / war), never hardcoded. Guard against war ~ 0.
  const rpw =
    Math.abs(props.war) > 0.05 ? props.rar / props.war : null;

  return (
    <div className="rounded-lg border border-navy/10 bg-white/50 p-4">
      <h3 className="text-sm font-semibold text-navy">{t("title")}</h3>

      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-navy">
          {props.war.toFixed(1)}
        </span>
        <span className="text-xs font-medium uppercase tracking-wide text-navy/55">
          {t("warLabel")}
        </span>
        {rpw !== null && (
          <span className="ml-1 text-xs text-navy/55">
            {t("perWin", {
              rar: props.rar.toFixed(1),
              rpw: rpw.toFixed(1),
            })}
          </span>
        )}
      </div>

      <div className="mt-3 h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {/* stackOffset="sign" => diverging: positives stack above 0, negatives
              below (default "none" would stack negatives within the positive
              column, never crossing the baseline). Verified geometry in §7.3. */}
          <BarChart
            data={data}
            stackOffset="sign"
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--color-navy)" }}
            />
            <YAxis
              width={34}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--color-navy)" }}
            />
            {/* Zero baseline so the divergence (negatives below) reads clearly. */}
            <ReferenceLine y={0} stroke="var(--color-navy)" strokeWidth={1} />
            {COMPONENT_ORDER.map((c) => (
              <Bar
                key={c.key}
                dataKey={c.key}
                stackId="war"
                fill={c.color}
                isAnimationActive={false}
                maxBarSize={72}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend with each component's signed value (doubles as the data table). */}
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        {COMPONENT_ORDER.map((c) => (
          <li key={c.key} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-navy/70">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: c.color }}
              />
              {t(c.labelKey)}
            </span>
            <span className="tabular-nums font-medium text-navy">
              {signed(values[c.key])}
            </span>
          </li>
        ))}
        <li className="col-span-2 mt-1 flex items-center justify-between gap-2 border-t border-navy/10 pt-1 sm:col-span-3">
          <span className="font-medium text-navy/70">{t("rarLabel")}</span>
          <span className="tabular-nums font-semibold text-navy">
            {props.rar.toFixed(1)}
          </span>
        </li>
      </ul>

      <p className="mt-3 text-xs leading-relaxed text-navy/55">
        {t("methodology")}
      </p>
    </div>
  );
}
