import { getTranslations } from "next-intl/server";
import CopyTableButton from "@/components/CopyTableButton";
import { HEAD_ROW, stripeBg, TD, TD_FIRST, TD_LAST, TH, TH_FIRST, TH_LAST } from "@/components/standings-chrome";
import RankChip from "@/components/team/RankChip";
import { PanelBlock } from "@/components/team/TeamPanel";
import { ordinal } from "@/lib/ordinal";
import { buildGrid, type GridRow } from "@/lib/team-grid";
import { formatMetric, METRIC, metricLabel, type MetricKey } from "@/lib/team-metrics";
import { TORONTO_TEAM_ID } from "@/lib/team-ids";
import type { MlbSeasonRow, TeamSeasonRow } from "@/lib/team-trends";

// Season page: the Blue Jays' team line for one season, every number next to
// the MLB average and the Jays' rank among 30 clubs (+ the prior season, grey).
// Values, MLB averages and ranks all come from the 022 views through P13's
// buildGrid — nothing is computed here. Offense and run prevention side by
// side, each split into the registry's sections (run scoring / contact quality,
// run prevention / contact allowed / defense).

const OFFENSE: MetricKey[] = [
  "r_per_g", "avg", "obp", "slg", "ops", "iso", "wrc_plus", "k_pct", "bb_pct", "hr_pct", "sb_per_g", "bat_war",
  "brl_pct", "hard_hit_pct", "xwoba",
];
const PREVENTION: MetricKey[] = [
  "ra_per_g", "era", "fip", "whip", "pit_k_pct", "pit_bb_pct", "pit_k_bb_pct", "hr9", "pit_war",
  "pit_brl_pct", "pit_hard_hit_pct", "pit_xwoba",
  "oaa",
];

export default async function TeamSeasonStats({
  season,
  prior,
  clubs,
  mlb,
  locale,
}: {
  season: number;
  prior: number | null; // shown only when the 022 views hold a Jays row for it
  clubs: TeamSeasonRow[]; // all 30 clubs, `season` (+ `prior`)
  mlb: MlbSeasonRow[];
  locale: string;
}) {
  const t = await getTranslations("Team");
  const hasPrior = prior != null && clubs.some((r) => r.season === prior && r.team_id === TORONTO_TEAM_ID);
  const seasons = hasPrior ? [prior, season] : [season];
  const cur = seasons.length - 1;

  const hint = (k: MetricKey) => (t.has(`hints.${k}`) ? t(`hints.${k}`) : undefined);
  const label = (k: MetricKey) => metricLabel(METRIC[k], t);

  const block = (title: string, keys: MetricKey[]) => {
    const rows: GridRow[] = buildGrid(keys.map((k) => METRIC[k]), clubs, mlb, seasons);
    const fmt = (r: GridRow, v: number | null) => formatMetric(v, METRIC[r.key].format);
    const headers = [t("colMetric"), season, t("trendsMlb"), t("colMlbRank"), ...(hasPrior ? [prior] : [])];
    const copyRows = rows.map((r) => {
      const c = r.cells[cur];
      return [
        label(r.key),
        fmt(r, c.value),
        fmt(r, c.mlb),
        c.rank != null ? ordinal(c.rank, locale, c.tied) : "",
        ...(hasPrior ? [fmt(r, r.cells[0].value)] : []),
      ];
    });
    const width = headers.length;

    return (
      <PanelBlock title={title} action={<CopyTableButton headers={headers} rows={copyRows} />}>
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap border-separate border-spacing-0 text-right text-sm tabular-nums">
            <thead>
              <tr className={HEAD_ROW}>
                <th className={`${TH_FIRST} sticky left-0 z-[1] bg-navy`}>{t("colMetric")}</th>
                <th className={TH}>{season}</th>
                <th className={TH}>{t("trendsMlb")}</th>
                <th className={hasPrior ? `${TH} text-center` : `${TH_LAST} text-center`}>{t("colMlbRank")}</th>
                {hasPrior && <th className={TH_LAST}>{prior}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const c = r.cells[cur];
                const section = i === 0 || rows[i - 1].section !== r.section;
                return [
                  section && (
                    <tr key={`${r.section}-head`}>
                      <td
                        colSpan={width}
                        className="pb-1 pl-3 pt-3 text-left font-display text-[11px] uppercase tracking-wider text-navy/55"
                      >
                        {t(`sections.${r.section}`)}
                      </td>
                    </tr>
                  ),
                  <tr key={r.key} className={`text-navy ${stripeBg(i)}`}>
                    {/* Sticky (opaque papaya) so the metric stays visible while the table scrolls on phones. */}
                    <td className={`${TD_FIRST} sticky left-0 z-[1] bg-papaya`} title={hint(r.key)}>
                      {label(r.key)}
                    </td>
                    <td className={`${TD} font-semibold`}>{fmt(r, c.value)}</td>
                    <td className={`${TD} text-navy/70`}>{fmt(r, c.mlb)}</td>
                    <td className={`${hasPrior ? TD : TD_LAST} text-center`}>
                      <RankChip rank={c.rank} tied={c.tied} locale={locale} small className="min-w-[2.75rem]" />
                    </td>
                    {hasPrior && <td className={`${TD_LAST} text-navy/50`}>{fmt(r, r.cells[0].value)}</td>}
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
      </PanelBlock>
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {block(t("offenseTitle"), OFFENSE)}
      {block(t("preventionTitle"), PREVENTION)}
    </div>
  );
}
