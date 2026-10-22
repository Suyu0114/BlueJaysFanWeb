import { getTranslations } from "next-intl/server";
import TableExport from "@/components/TableExport";
import { HEAD_ROW, stripeBg, TD, TD_FIRST, TD_LAST, TH, TH_FIRST, TH_LAST } from "@/components/standings-chrome";
import RankChip from "@/components/team/RankChip";
import { PanelBlock } from "@/components/team/TeamPanel";
import { ordinal } from "@/lib/ordinal";
import { teamAbbr } from "@/lib/team-abbr";
import { TORONTO_TEAM_ID } from "@/lib/team-ids";
import type { PositionVsMlb } from "@/lib/team-position";

// Season page: the Blue Jays' HR and OPS at each position next to the MLB
// average at that position and their rank among 30 clubs (P13 rank chips —
// the tint lives here, not in the vs MLB chart above, where brick = worse).
// Every number comes from the 025 view (lib/team-position.ts); nothing is
// computed here. An article can pass two or more clubs (a World Series
// preview): one HR + OPS pair per club, side by side, then the MLB averages.

const r3 = (v: number | null) => (v == null ? "—" : v.toFixed(3).replace(/^0(?=\.)/, ""));
const n0 = (v: number | null) => (v == null ? "—" : v.toFixed(0));
const n1 = (v: number | null) => (v == null ? "—" : v.toFixed(1));

export type PositionVsMlbClub = { teamId: number; rows: PositionVsMlb[] };

export default async function PositionVsMlbTable({
  clubs,
  season,
  locale,
}: {
  clubs: PositionVsMlbClub[]; // one club = the season page's layout (with PA); more = side by side
  season: number;
  locale: string;
}) {
  const t = await getTranslations("Season");
  const te = await getTranslations("Export");
  const title = t("posVsMlbTitle");
  const who =
    clubs.length === 1 && clubs[0].teamId === TORONTO_TEAM_ID
      ? te("jaysSeason", { season })
      : `${season} ${clubs.map((c) => teamAbbr(c.teamId)).join(" vs ")}`;
  const exportProps = { name: `${who} ${title}`, caption: `${who} · ${title}` };
  const rank = (r: number | null, tied: boolean) => (r != null ? ordinal(r, locale, tied) : "");

  if (clubs.length > 1) {
    const ref = clubs[0].rows; // groups + MLB row; every club's reader returns the same groups
    const at = (c: PositionVsMlbClub, group: string) => c.rows.find((r) => r.group === group)?.club;
    const headers = [
      t("colPos"),
      ...clubs.flatMap((c) => {
        const a = teamAbbr(c.teamId);
        return [`${a} HR`, `${a} ${t("colRankOf", { metric: "HR" })}`, `${a} OPS`, `${a} ${t("colRankOf", { metric: "OPS" })}`];
      }),
      t("colMlbAvg", { metric: "HR" }),
      t("colMlbAvg", { metric: "OPS" }),
    ];
    const copyRows = ref.map((r) => [
      r.group,
      ...clubs.flatMap((c) => {
        const x = at(c, r.group);
        return x
          ? [n0(x.hr), rank(x.hr_rank, x.hr_tied), r3(x.ops), rank(x.ops_rank, x.ops_tied)]
          : ["—", "", "—", ""];
      }),
      n1(r.mlb.hr),
      r3(r.mlb.ops),
    ]);

    return (
      <PanelBlock title={title} action={<TableExport headers={headers} rows={copyRows} {...exportProps} />} note={t("posVsMlbNote")}>
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap border-separate border-spacing-0 text-right text-sm tabular-nums">
            <thead>
              <tr className={HEAD_ROW}>
                <th className={`${TH_FIRST} sticky left-0 z-[1] bg-navy`}>{t("colPos")}</th>
                {clubs.map((c) => [
                  <th key={`${c.teamId}-hr`} className={TH}>{`${teamAbbr(c.teamId)} HR`}</th>,
                  <th key={`${c.teamId}-ops`} className={TH}>{`${teamAbbr(c.teamId)} OPS`}</th>,
                ])}
                <th className={TH}>{t("colMlbAvg", { metric: "HR" })}</th>
                <th className={TH_LAST}>{t("colMlbAvg", { metric: "OPS" })}</th>
              </tr>
            </thead>
            <tbody>
              {ref.map((r, i) => (
                <tr key={r.group} className={`text-navy ${stripeBg(i)}`}>
                  <td className={`${TD_FIRST} sticky left-0 z-[1] bg-papaya`}>{r.group}</td>
                  {clubs.map((c) => {
                    const x = at(c, r.group);
                    return [
                      <td key={`${c.teamId}-hr`} className={TD}>
                        <span className="font-semibold">{n0(x?.hr ?? null)}</span>
                        <RankChip rank={x?.hr_rank} tied={x?.hr_tied} locale={locale} small className="ml-1.5 min-w-[2.75rem]" />
                      </td>,
                      <td key={`${c.teamId}-ops`} className={TD}>
                        <span className="font-semibold">{r3(x?.ops ?? null)}</span>
                        <RankChip rank={x?.ops_rank} tied={x?.ops_tied} locale={locale} small className="ml-1.5 min-w-[2.75rem]" />
                      </td>,
                    ];
                  })}
                  <td className={`${TD} text-navy/70`}>{n1(r.mlb.hr)}</td>
                  <td className={`${TD_LAST} text-navy/70`}>{r3(r.mlb.ops)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelBlock>
    );
  }

  const rows = clubs[0]?.rows ?? [];
  const headers = [
    t("colPos"),
    "PA",
    "HR",
    t("colRankOf", { metric: "HR" }),
    t("colMlbAvg", { metric: "HR" }),
    "OPS",
    t("colRankOf", { metric: "OPS" }),
    t("colMlbAvg", { metric: "OPS" }),
  ];
  const copyRows = rows.map((r) => [
    r.group,
    n0(r.club.pa),
    n0(r.club.hr),
    rank(r.club.hr_rank, r.club.hr_tied),
    n1(r.mlb.hr),
    r3(r.club.ops),
    rank(r.club.ops_rank, r.club.ops_tied),
    r3(r.mlb.ops),
  ]);

  return (
    <PanelBlock
      title={title}
      action={<TableExport headers={headers} rows={copyRows} {...exportProps} />}
      note={t("posVsMlbNote")}
    >
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap border-separate border-spacing-0 text-right text-sm tabular-nums">
          <thead>
            <tr className={HEAD_ROW}>
              <th className={`${TH_FIRST} sticky left-0 z-[1] bg-navy`}>{t("colPos")}</th>
              <th className={TH}>PA</th>
              <th className={TH}>HR</th>
              <th className={TH}>{t("colMlbAvg", { metric: "HR" })}</th>
              <th className={TH}>OPS</th>
              <th className={TH_LAST}>{t("colMlbAvg", { metric: "OPS" })}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.group} className={`text-navy ${stripeBg(i)}`}>
                {/* Sticky (opaque papaya) so the position stays visible while the table scrolls on phones. */}
                <td className={`${TD_FIRST} sticky left-0 z-[1] bg-papaya`}>{r.group}</td>
                <td className={`${TD} text-navy/60`}>{n0(r.club.pa)}</td>
                <td className={TD}>
                  <span className="font-semibold">{n0(r.club.hr)}</span>
                  <RankChip rank={r.club.hr_rank} tied={r.club.hr_tied} locale={locale} small className="ml-1.5 min-w-[2.75rem]" />
                </td>
                <td className={`${TD} text-navy/70`}>{n1(r.mlb.hr)}</td>
                <td className={TD}>
                  <span className="font-semibold">{r3(r.club.ops)}</span>
                  <RankChip rank={r.club.ops_rank} tied={r.club.ops_tied} locale={locale} small className="ml-1.5 min-w-[2.75rem]" />
                </td>
                <td className={`${TD_LAST} text-navy/70`}>{r3(r.mlb.ops)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PanelBlock>
  );
}
