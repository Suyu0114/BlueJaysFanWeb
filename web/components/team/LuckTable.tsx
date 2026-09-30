import { getTranslations } from "next-intl/server";
import CopyTableButton from "@/components/CopyTableButton";
import { HEAD_ROW, stripeBg, TD, TD_FIRST, TD_LAST, TH, TH_FIRST, TH_LAST } from "@/components/standings-chrome";
import { PanelBlock } from "@/components/team/TeamPanel";
import RankChip from "@/components/team/RankChip";
import { ordinal } from "@/lib/ordinal";
import { formatMetric } from "@/lib/team-metrics";
import type { WinLoss } from "@/lib/team-season";
import type { TeamSeasonRow } from "@/lib/team-trends";

// P13 module ①: actual record vs MLB's expected (Pythagorean) record, the gap
// ("luck", W − xW — signed text, not coloured good/bad: it isn't a skill), the
// one-run record that usually explains it, and the run differential with its
// 30-club rank (shaded on the shared percentile scale).

const wl = (r: WinLoss | null | undefined) => (r ? `${r.w}-${r.l}` : "—");

export default async function LuckTable({
  rows,
  oneRun,
  rankTies,
  locale,
}: {
  rows: TeamSeasonRow[]; // the Jays, oldest -> newest
  oneRun: Record<number, WinLoss>;
  rankTies: Record<number, boolean>; // season -> is the run-diff rank shared?
  locale: string;
}) {
  const t = await getTranslations("Team");
  const headers = [t("colSeason"), "W-L", t("colExpected"), t("colLuck"), t("colOneRun"), t("labels.run_diff"), t("colMlbRank")];
  const cells = rows.map((r) => {
    const rank = r.run_diff_rank;
    return {
      season: r.season,
      record: r.w != null && r.l != null ? `${r.w}-${r.l}` : "—",
      expected: r.x_w != null && r.x_l != null ? `${r.x_w}-${r.x_l}` : "—",
      luck: formatMetric(r.luck, "signed"),
      oneRun: wl(oneRun[r.season]),
      runDiff: formatMetric(r.run_diff, "signed"),
      rank,
      rankText: rank != null ? ordinal(rank, locale, rankTies[r.season]) : "—",
    };
  });

  return (
    <PanelBlock
      title={t("luckTitle")}
      action={
        <CopyTableButton
          headers={headers}
          rows={cells.map((c) => [c.season, c.record, c.expected, c.luck, c.oneRun, c.runDiff, c.rankText])}
        />
      }
      note={t("luckNote")}
    >
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap border-separate border-spacing-0 text-right text-sm tabular-nums">
          <thead>
            <tr className={HEAD_ROW}>
              <th className={TH_FIRST}>{headers[0]}</th>
              <th className={TH}>{headers[1]}</th>
              <th className={TH}>{headers[2]}</th>
              <th className={TH}>{headers[3]}</th>
              <th className={TH}>{headers[4]}</th>
              <th className={TH}>{headers[5]}</th>
              <th className={TH_LAST}>{headers[6]}</th>
            </tr>
          </thead>
          <tbody>
            {cells.map((c, i) => (
              <tr key={c.season} className={`text-navy ${stripeBg(i)}`}>
                <td className={`${TD_FIRST} font-display`}>{c.season}</td>
                <td className={`${TD} font-semibold`}>{c.record}</td>
                <td className={`${TD} text-navy/70`}>{c.expected}</td>
                <td className={TD}>{c.luck}</td>
                <td className={`${TD} text-navy/70`}>{c.oneRun}</td>
                <td className={TD}>{c.runDiff}</td>
                <td className={TD_LAST}>
                  <RankChip rank={c.rank} tied={rankTies[c.season]} locale={locale} className="min-w-[3.25rem]" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PanelBlock>
  );
}
