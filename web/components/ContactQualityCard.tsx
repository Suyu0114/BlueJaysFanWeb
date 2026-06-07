import { getTranslations } from "next-intl/server";
import type { ExitVeloStats } from "@/lib/exit-velo-stats";

function fmt1(v: number | null): string {
  return v == null ? "—" : v.toFixed(1);
}
function fmtPct(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(1)}%`;
}

function Kpi({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-lg border border-steel/30 bg-white/40 px-3 py-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-navy/45">
        {label}
      </div>
      <div className="text-base font-semibold text-navy">
        {value}
        {unit && value !== "—" && (
          <span className="ml-1 text-xs font-normal text-navy/50">{unit}</span>
        )}
      </div>
    </div>
  );
}

// P9: Statcast contact-quality summary on the overview, scoped to one season.
// Reuses computeExitVeloStats (lib/exit-velo-stats.ts) — the page computes the
// stats server-side from the season-filtered batted balls. Stat labels reuse the
// existing `Batting` namespace keys.
export default async function ContactQualityCard({
  stats,
  season,
}: {
  stats: ExitVeloStats;
  season: number;
}) {
  const t = await getTranslations("Overview");
  const tb = await getTranslations("Batting");
  if (stats.withEV === 0) return null;

  return (
    <div className="rounded-lg border border-navy/10 bg-white/50 p-4">
      <h3 className="text-sm font-semibold text-navy">
        {t("contactTitle")}{" "}
        <span className="font-normal text-navy/45">· {season}</span>
      </h3>
      <div className="mt-2 flex flex-wrap gap-2">
        <Kpi label={tb("avgEV")} value={fmt1(stats.avgEV)} unit="mph" />
        <Kpi label={tb("maxEV")} value={fmt1(stats.maxEV)} unit="mph" />
        <Kpi label={tb("hardHitPct")} value={fmtPct(stats.hardHitPct)} />
      </div>
      <p className="mt-2 text-xs text-navy/45">
        {t("contactSubtitle", { withEV: stats.withEV })}
      </p>
    </div>
  );
}
