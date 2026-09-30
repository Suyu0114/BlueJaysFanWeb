import { getTranslations } from "next-intl/server";
import RankChip from "@/components/team/RankChip";
import { formatMetric, tiedRank } from "@/lib/team-metrics";
import type { TeamSeasonRow } from "@/lib/team-trends";

// P13 module ③: ERA vs FIP per season. FIP (from the 022 view: strikeouts,
// walks, hit batters, homers + the season constant) is what the pitchers alone
// "earned"; the gap to ERA is mostly the defense behind them and sequencing.
// Shown with the team's OAA and rank so the reader can weigh the defense.
// Plain text, not good/bad colour — the gap describes fortune and fielding.

// Under ~0.15 runs per 9 the ERA–FIP gap is noise for a full team season.
export const ERA_FIP_EVEN = 0.15;

export default async function EraFipGap({
  rows,
  clubs,
  locale,
}: {
  rows: TeamSeasonRow[]; // the Jays, oldest -> newest
  clubs: TeamSeasonRow[];
  locale: string;
}) {
  const t = await getTranslations("Team");
  return (
    <ul className="grid gap-2 sm:grid-cols-5">
      {rows.map((r) => {
        const gap = r.era != null && r.fip != null ? r.era - r.fip : null;
        const text =
          gap == null
            ? "—"
            : Math.abs(gap) < ERA_FIP_EVEN
              ? t("eraFipEven")
              : t(gap > 0 ? "eraFipWorse" : "eraFipBetter", { gap: Math.abs(gap).toFixed(2) });
        return (
          <li key={r.season} className="rounded-md border border-navy/10 bg-papaya/50 px-2.5 py-2 text-xs text-navy">
            <div className="font-display text-[11px] uppercase tracking-wider text-navy/60">{r.season}</div>
            <div className="mt-0.5 tabular-nums">
              ERA {formatMetric(r.era, "dec2")} · FIP {formatMetric(r.fip, "dec2")}
            </div>
            <div className="mt-0.5 text-navy/65">{text}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-navy/60">
              <span className="whitespace-nowrap">OAA {formatMetric(r.oaa, "int")}</span>
              <RankChip rank={r.oaa_rank} tied={tiedRank(clubs, r.season, "oaa", r.oaa_rank)} locale={locale} small />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
