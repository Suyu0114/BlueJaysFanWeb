import { getTranslations } from "next-intl/server";
import SeasonPanel from "@/components/season/SeasonPanel";
import { HEAD_ROW, stripeBg, TD, TD_FIRST, TD_LAST, TH, TH_FIRST, TH_LAST } from "@/components/standings-chrome";
import { DIVISION_KEY, TORONTO_TEAM_ID, type StandingsRow } from "@/lib/standings";
import { longestStreak, seasonSplits, winPct, type SplitKey, type TeamGame } from "@/lib/team-season";
import { r3, streakText, wl } from "@/lib/season-format";

// The season page's "Splits" panel (P12 M5): situational records next to the
// prior season, plus the longest losing streak. Opponents are bucketed by that
// season's final standings. `highlight` picks rows out in brick (article
// figures point the reader at the rows the text is about).

export default async function SeasonSplitsPanel({
  season,
  prior,
  games,
  priorGames,
  standings,
  priorStandings,
  locale,
  highlight = [],
}: {
  season: number;
  prior: number | null;
  games: TeamGame[];
  priorGames: TeamGame[];
  standings: StandingsRow[];
  priorStandings: StandingsRow[];
  locale: string;
  highlight?: SplitKey[];
}) {
  const t = await getTranslations("Season");
  const ts = await getTranslations("Standings");

  const ctxFor = (rows: StandingsRow[]) => ({
    ownDivision: rows.find((r) => r.team_id === TORONTO_TEAM_ID)?.division_id ?? 201,
    divisionOf: new Map(rows.map((r) => [r.team_id, r.division_id])),
    pctOf: new Map(rows.filter((r) => r.pct != null).map((r) => [r.team_id, r.pct as number])),
  });
  const splits = seasonSplits(games, ctxFor(standings));
  const psplits = prior ? seasonSplits(priorGames, ctxFor(priorStandings)) : null;
  const ownDivisionName = ts(DIVISION_KEY[ctxFor(standings).ownDivision] ?? "alEast");
  const splitRows: { key: SplitKey; label: string }[] = [
    { key: "home", label: t("splitHome") },
    { key: "away", label: t("splitAway") },
    { key: "oneRun", label: t("splitOneRun") },
    { key: "blowouts", label: t("splitBlowouts") },
    { key: "vsDivision", label: t("splitVsDivision", { division: ownDivisionName }) },
    { key: "vsWinning", label: t("splitVsWinning") },
    { key: "vsLosing", label: t("splitVsLosing") },
  ];
  const losing = (gs: TeamGame[]) => streakText(longestStreak(gs, "L"), locale, (v) => t("streakValue", v));

  return (
    <SeasonPanel
      seedKey="season-splits"
      season={season}
      title={t("splitsTitle")}
      note={t("splitsNote")}
      copy={{
        headers: [t("colSplit"), season, "PCT", ...(prior ? [prior, "PCT"] : [])],
        rows: splitRows.map((r) => {
          const a = splits[r.key];
          const b = psplits?.[r.key];
          return [r.label, wl(a), r3(winPct(a)), ...(prior ? [b ? wl(b) : "", b ? r3(winPct(b)) : ""] : [])];
        }),
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-right text-sm tabular-nums">
          <thead>
            <tr className={HEAD_ROW}>
              <th className={TH_FIRST}>{t("colSplit")}</th>
              <th className={TH}>{season}</th>
              <th className={prior ? TH : TH_LAST}>PCT</th>
              {prior && <th className={TH}>{prior}</th>}
              {prior && <th className={TH_LAST}>PCT</th>}
            </tr>
          </thead>
          <tbody>
            {splitRows.map((r, i) => {
              const a = splits[r.key];
              const b = psplits?.[r.key];
              return (
                <tr key={r.key} className={stripeBg(i, highlight.includes(r.key))}>
                  <td className={TD_FIRST}>{r.label}</td>
                  <td className={`${TD} font-semibold`}>{wl(a)}</td>
                  <td className={`${prior ? TD : TD_LAST} text-navy/60`}>{r3(winPct(a))}</td>
                  {prior && <td className={TD}>{b ? wl(b) : "—"}</td>}
                  {prior && <td className={`${TD_LAST} text-navy/60`}>{b ? r3(winPct(b)) : "—"}</td>}
                </tr>
              );
            })}
            <tr className={stripeBg(splitRows.length)}>
              <td className={TD_FIRST}>{t("streakL")}</td>
              <td className={`${TD} font-semibold`} colSpan={2}>{losing(games)}</td>
              {prior && <td className={TD_LAST} colSpan={2}>{losing(priorGames)}</td>}
            </tr>
          </tbody>
        </table>
      </div>
    </SeasonPanel>
  );
}
