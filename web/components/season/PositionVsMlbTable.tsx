import { getTranslations } from "next-intl/server";
import TableExport from "@/components/TableExport";
import { HEAD_ROW, stripeBg, TD, TD_FIRST, TD_LAST, TH, TH_FIRST, TH_LAST } from "@/components/standings-chrome";
import RankChip from "@/components/team/RankChip";
import { PanelBlock } from "@/components/team/TeamPanel";
import { ordinal } from "@/lib/ordinal";
import type { PositionVsMlb } from "@/lib/team-position";

// Season page: the Blue Jays' HR and OPS at each position next to the MLB
// average at that position and their rank among 30 clubs (P13 rank chips —
// the tint lives here, not in the vs MLB chart above, where brick = worse).
// Every number comes from the 025 view (lib/team-position.ts); nothing is
// computed here.

const r3 = (v: number | null) => (v == null ? "—" : v.toFixed(3).replace(/^0(?=\.)/, ""));
const n0 = (v: number | null) => (v == null ? "—" : v.toFixed(0));
const n1 = (v: number | null) => (v == null ? "—" : v.toFixed(1));

export default async function PositionVsMlbTable({
  rows,
  season,
  locale,
}: {
  rows: PositionVsMlb[];
  season: number;
  locale: string;
}) {
  const t = await getTranslations("Season");
  const te = await getTranslations("Export");
  const title = t("posVsMlbTitle");

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
    n0(r.jays.pa),
    n0(r.jays.hr),
    r.jays.hr_rank != null ? ordinal(r.jays.hr_rank, locale, r.jays.hr_tied) : "",
    n1(r.mlb.hr),
    r3(r.jays.ops),
    r.jays.ops_rank != null ? ordinal(r.jays.ops_rank, locale, r.jays.ops_tied) : "",
    r3(r.mlb.ops),
  ]);

  return (
    <PanelBlock
      title={title}
      action={
        <TableExport
          headers={headers}
          rows={copyRows}
          name={`${te("jaysSeason", { season })} ${title}`}
          caption={`${te("jaysSeason", { season })} · ${title}`}
        />
      }
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
                <td className={`${TD} text-navy/60`}>{n0(r.jays.pa)}</td>
                <td className={TD}>
                  <span className="font-semibold">{n0(r.jays.hr)}</span>
                  <RankChip rank={r.jays.hr_rank} tied={r.jays.hr_tied} locale={locale} small className="ml-1.5 min-w-[2.75rem]" />
                </td>
                <td className={`${TD} text-navy/70`}>{n1(r.mlb.hr)}</td>
                <td className={TD}>
                  <span className="font-semibold">{r3(r.jays.ops)}</span>
                  <RankChip rank={r.jays.ops_rank} tied={r.jays.ops_tied} locale={locale} small className="ml-1.5 min-w-[2.75rem]" />
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
