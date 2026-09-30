import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import ScorecardFrame from "@/components/ScorecardFrame";
import { RevealGroup, RevealItem } from "@/components/motion/Reveal";
import { DIVISION_KEY } from "@/lib/standings";
import RankChip from "@/components/team/RankChip";
import { ordinal } from "@/lib/ordinal";
import { formatMetric } from "@/lib/team-metrics";
import type { PostseasonResult } from "@/lib/team-season";
import type { TeamSeasonRow } from "@/lib/team-trends";

// P13: one card per season — record, division finish, how it ended, run
// differential with its MLB rank. Each card opens that season's P12 page, so
// they are real `card` frames (hover lift = clickable).

const FULL_SEASON = 162;

export default async function SeasonStrip({
  rows,
  post,
  runDiffTies,
  locale,
}: {
  rows: TeamSeasonRow[]; // the Jays, oldest -> newest
  post: Record<number, PostseasonResult>;
  runDiffTies: Record<number, boolean>;
  locale: string;
}) {
  const t = await getTranslations("Team");
  const ts = await getTranslations("Standings");

  return (
    <RevealGroup as="ul" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {rows.map((r) => {
        const result = post[r.season] ?? "missed";
        const finish =
          r.division_rank != null && r.division_id != null
            ? t("finishValue", {
                rank: ordinal(r.division_rank, locale),
                division: ts(DIVISION_KEY[r.division_id] ?? "alEast"),
              })
            : "—";
        const inProgress = (r.games ?? 0) < FULL_SEASON && result === "missed";
        return (
          <RevealItem as="li" key={r.season}>
            <ScorecardFrame seedKey={`team-strip-${r.season}`} className="h-full">
              <Link href={`/season/${r.season}`} className="relative z-10 block h-full p-3">
                <div className="font-display text-lg uppercase tracking-wide text-navy">{r.season}</div>
                <div className="text-2xl font-semibold tabular-nums text-navy">
                  {r.w ?? "—"}-{r.l ?? "—"}
                </div>
                <div className="text-xs text-navy/65">{finish}</div>
                <div
                  className={`mt-1 text-xs font-medium ${
                    inProgress ? "text-steel" : result === "missed" ? "text-navy/50" : "text-brick"
                  }`}
                >
                  {inProgress ? t("inProgress") : t(`post.${result}`)}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] tabular-nums text-navy/60">
                  <span className="whitespace-nowrap">
                    {t("stripRunDiff", { diff: formatMetric(r.run_diff, "signed") })}
                  </span>
                  <RankChip
                    rank={r.run_diff_rank}
                    tied={runDiffTies[r.season]}
                    locale={locale}
                    title={t("rankKey")}
                    small
                  />
                </div>
              </Link>
            </ScorecardFrame>
          </RevealItem>
        );
      })}
    </RevealGroup>
  );
}
