import { getTranslations } from "next-intl/server";
import Exportable from "@/components/Exportable";
import SeasonPanel from "@/components/season/SeasonPanel";
import MonthlyRunsChart from "@/components/season/MonthlyRunsChart";
import { HEAD_ROW, stripeBg, TD, TD_FIRST, TD_LAST, TH, TH_FIRST, TH_LAST } from "@/components/standings-chrome";
import { monthlyRecords, type TeamGame } from "@/lib/team-season";
import { wl } from "@/lib/season-format";

// The season page's "Month by month" panel (P12 M5): runs per game by month
// (chart, this season) above the monthly record + RS-RA next to the prior
// season (table). March games count toward April and October toward
// September (lib/team-season.ts monthlyRecords). Also an article figure.

export default async function MonthlyRecordPanel({
  season,
  prior,
  games,
  priorGames,
  mlbRunsPerGame,
  locale,
}: {
  season: number;
  prior: number | null;
  games: TeamGame[];
  priorGames: TeamGame[];
  mlbRunsPerGame: number | null; // the 022 MLB row's R/G for `season`; null hides the reference line
  locale: string;
}) {
  const t = await getTranslations("Season");

  const months = monthlyRecords(games);
  const pmonths = monthlyRecords(priorGames);
  const monthKeys = [...new Set([...months, ...pmonths].map((m) => m.month))].sort((a, b) => a - b);
  const monthFmt = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  const monthLabel = (m: number) =>
    m === 4 ? t("monthMarApr") : m === 9 ? t("monthSepOct") : monthFmt.format(new Date(Date.UTC(2000, m - 1, 1)));

  const perGame = months.map((m) => ({
    label: monthLabel(m.month),
    rs: m.rs / (m.w + m.l),
    ra: m.ra / (m.w + m.l),
    record: wl(m),
  }));

  const title = t("monthlyTitle");
  return (
    <SeasonPanel
      seedKey="season-months"
      season={season}
      title={title}
      note={t("monthlyNote")}
      copy={{
        headers: [t("colMonth"), season, "RS-RA", ...(prior ? [prior, "RS-RA"] : [])],
        rows: monthKeys.map((m) => {
          const a = months.find((x) => x.month === m);
          const b = pmonths.find((x) => x.month === m);
          return [
            monthLabel(m),
            a ? wl(a) : "",
            a ? `${a.rs}-${a.ra}` : "",
            ...(prior ? [b ? wl(b) : "", b ? `${b.rs}-${b.ra}` : ""] : []),
          ];
        }),
      }}
    >
      {perGame.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-navy">{t("monthlyRunsTitle", { season })}</h3>
          <Exportable
            name={`blue jays runs per game by month ${season}`}
            caption={`Blue Jays · ${t("monthlyRunsTitle", { season })}`}
            className="mt-1"
          >
            <MonthlyRunsChart
              data={perGame}
              mlbRunsPerGame={mlbRunsPerGame}
              labels={{
                rs: t("monthlyRunsRs"),
                ra: t("monthlyRunsRa"),
                mlb: mlbRunsPerGame != null ? t("monthlyRunsMlb", { value: mlbRunsPerGame.toFixed(2) }) : "",
              }}
            />
          </Exportable>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-right text-sm tabular-nums">
          <thead>
            <tr className={HEAD_ROW}>
              <th className={TH_FIRST}>{t("colMonth")}</th>
              <th className={TH}>{season}</th>
              <th className={TH}>RS-RA</th>
              {prior && <th className={TH}>{prior}</th>}
              {prior && <th className={TH_LAST}>RS-RA</th>}
            </tr>
          </thead>
          <tbody>
            {monthKeys.map((m, i) => {
              const a = months.find((x) => x.month === m);
              const b = pmonths.find((x) => x.month === m);
              return (
                <tr key={m} className={stripeBg(i)}>
                  <td className={TD_FIRST}>{monthLabel(m)}</td>
                  <td className={`${TD} font-semibold`}>{a ? wl(a) : "—"}</td>
                  <td className={`${TD} text-navy/60`}>{a ? `${a.rs}-${a.ra}` : "—"}</td>
                  {prior && <td className={TD}>{b ? wl(b) : "—"}</td>}
                  {prior && <td className={`${TD_LAST} text-navy/60`}>{b ? `${b.rs}-${b.ra}` : "—"}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SeasonPanel>
  );
}
