import { getTranslations } from "next-intl/server";
import CopyTableButton from "@/components/CopyTableButton";
import { HEAD_ROW, stripeBg, TD, TD_FIRST, TD_LAST, TH, TH_FIRST, TH_LAST } from "@/components/standings-chrome";
import { PanelBlock } from "@/components/team/TeamPanel";
import { winPct, type SplitKey, type WinLoss } from "@/lib/team-season";

// P13 module ④: situational records, every season side by side — the same
// seasonSplits (lib/team-season.ts) and the same row labels as the P12 season
// page, so a number here always equals /season/[year]. Rows = splits,
// columns = seasons (labels are long; seasons are short). No 30-club ranks:
// other clubs' game logs aren't stored.

const ORDER: SplitKey[] = ["home", "away", "oneRun", "blowouts", "vsDivision", "vsWinning", "vsLosing"];
const LABEL_KEY: Record<SplitKey, string> = {
  home: "splitHome",
  away: "splitAway",
  oneRun: "splitOneRun",
  blowouts: "splitBlowouts",
  vsDivision: "splitVsDivision",
  vsWinning: "splitVsWinning",
  vsLosing: "splitVsLosing",
};

const wl = (r: WinLoss) => `${r.w}-${r.l}`;
const pct3 = (v: number | null) => (v == null ? "—" : v.toFixed(3).replace(/^0/, ""));

export default async function TeamSplitsTable({
  seasons,
  division,
}: {
  seasons: { season: number; splits: Record<SplitKey, WinLoss> }[]; // oldest -> newest
  division: string; // the Jays' division name, e.g. "AL East"
}) {
  const t = await getTranslations("Team");
  const ts = await getTranslations("Season");
  const label = (k: SplitKey) => ts(LABEL_KEY[k], { division });

  const copyHeaders = [t("colSplit"), ...seasons.map((s) => s.season)];
  const copyRows = ORDER.map((k) => [label(k), ...seasons.map((s) => `${wl(s.splits[k])} (${pct3(winPct(s.splits[k]))})`)]);

  return (
    <PanelBlock title={t("splitsTitle")} action={<CopyTableButton headers={copyHeaders} rows={copyRows} />} note={t("splitsNote")}>
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap border-separate border-spacing-0 text-right text-sm tabular-nums">
          <thead>
            <tr className={HEAD_ROW}>
              <th className={`${TH_FIRST} sticky left-0 z-[1] bg-navy`}>{t("colSplit")}</th>
              {seasons.map((s, i) => (
                <th key={s.season} className={i === seasons.length - 1 ? TH_LAST : TH}>
                  {s.season}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ORDER.map((k, i) => (
              <tr key={k} className={`text-navy ${stripeBg(i)}`}>
                <td className={`${TD_FIRST} sticky left-0 z-[1] bg-papaya`}>{label(k)}</td>
                {seasons.map((s, j) => (
                  <td key={s.season} className={j === seasons.length - 1 ? TD_LAST : TD}>
                    <div className="font-semibold">{wl(s.splits[k])}</div>
                    <div className="text-[10px] leading-tight text-navy/55">{pct3(winPct(s.splits[k]))}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PanelBlock>
  );
}
