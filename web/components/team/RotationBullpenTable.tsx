import { getTranslations } from "next-intl/server";
import TableExport from "@/components/TableExport";
import { HEAD_ROW, stripeBg, TD, TD_FIRST, TD_LAST, TH, TH_FIRST, TH_LAST } from "@/components/standings-chrome";
import RankChip from "@/components/team/RankChip";
import { PanelBlock } from "@/components/team/TeamPanel";
import { ordinal } from "@/lib/ordinal";
import { formatMetric, METRIC, metricLabel, rankKey, tiedRank, type MetricKey } from "@/lib/team-metrics";
import type { TeamSeasonRow } from "@/lib/team-trends";

// P13 module ③: the rotation and the bullpen side by side, season by season —
// each number ranked against the other 29 rotations / bullpens (ranks from the
// 022 view; FIP there uses the season's league constant). IP share = the
// rotation's share of the team's innings.

const ROTATION: MetricKey[] = ["sp_ip_share", "sp_era", "sp_fip", "sp_k_bb_pct"];
const BULLPEN: MetricKey[] = ["rp_era", "rp_fip", "rp_k_bb_pct"];

export default async function RotationBullpenTable({
  rows,
  clubs,
  locale,
}: {
  rows: TeamSeasonRow[]; // the Jays, oldest -> newest
  clubs: TeamSeasonRow[]; // all 30 clubs (tie detection)
  locale: string;
}) {
  const t = await getTranslations("Team");
  const span = rows.length ? t("title", { from: rows[0].season, to: rows[rows.length - 1].season }) : "";
  const keys = [...ROTATION, ...BULLPEN];
  const label = (k: MetricKey) => metricLabel(METRIC[k], t);

  const cell = (r: TeamSeasonRow, k: MetricKey) => {
    const rank = r[rankKey(k)];
    return {
      value: formatMetric(r[k], METRIC[k].format),
      rank,
      tied: tiedRank(clubs, r.season, k, rank),
    };
  };

  const copyHeaders = [
    t("colSeason"),
    ...ROTATION.map((k) => `${t("sections.rotation")} ${label(k)}`),
    ...BULLPEN.map((k) => `${t("sections.bullpen")} ${label(k)}`),
  ];
  const copyRows = rows.map((r) => [
    r.season,
    ...keys.map((k) => {
      const c = cell(r, k);
      return c.rank != null ? `${c.value} (${ordinal(c.rank, locale, c.tied)})` : c.value;
    }),
  ]);

  return (
    <PanelBlock title={t("rolesTitle")} action={
        <TableExport
          headers={copyHeaders}
          rows={copyRows}
          name={`${span} ${t("rolesTitle")}`}
          caption={[span, t("rolesTitle")].filter(Boolean).join(" · ")}
        />
      } note={t("rolesNote")}>
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap border-separate border-spacing-0 text-right text-sm tabular-nums">
          <thead>
            <tr className="text-[11px] text-navy/55">
              <th />
              <th colSpan={ROTATION.length} className="pb-1 text-center font-display font-normal uppercase tracking-wider">
                {t("sections.rotation")}
              </th>
              <th colSpan={BULLPEN.length} className="border-l border-navy/15 pb-1 text-center font-display font-normal uppercase tracking-wider">
                {t("sections.bullpen")}
              </th>
            </tr>
            <tr className={HEAD_ROW}>
              <th className={`${TH_FIRST} sticky left-0 z-[1] bg-navy`}>{t("colSeason")}</th>
              {keys.map((k, i) => (
                <th key={k} className={i === keys.length - 1 ? TH_LAST : TH}>
                  {label(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.season} className={`text-navy ${stripeBg(i)}`}>
                {/* Sticky (opaque papaya) so the season stays visible while the wide table scrolls on phones. */}
                <td className={`${TD_FIRST} sticky left-0 z-[1] bg-papaya font-display`}>{r.season}</td>
                {keys.map((k, j) => {
                  const c = cell(r, k);
                  return (
                    <td
                      key={k}
                      className={`${j === keys.length - 1 ? TD_LAST : TD} ${j === ROTATION.length ? "border-l border-navy/15" : ""}`}
                    >
                      <span className="font-semibold">{c.value}</span>{" "}
                      <RankChip rank={c.rank} tied={c.tied} locale={locale} small className="ml-1 min-w-[2.75rem]" />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PanelBlock>
  );
}
