import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import PlayoffRace from "./PlayoffRace";
import ScorecardFrame from "./ScorecardFrame";
import { TeamCell } from "./TeamLogo";
import {
  HEAD_ROW,
  rowBg,
  TD,
  TD_FIRST,
  TD_LAST,
  TH,
  TH_FIRST,
  TH_LAST,
} from "./standings-chrome";
import {
  AL_EAST,
  AMERICAN_LEAGUE_ID,
  byDivision,
  clinchMarker,
  gb,
  int0,
  pct3,
  record,
  type StandingsRow,
} from "@/lib/standings";

// P11 home module: AL East + the AL playoff race, in the parchment scorecard
// chrome the hero and roster cards use. Deliberately narrower than the full
// /standings tables — this is the "are we in it?" glance, not the whole league.
export default async function HomeStandings({
  rows,
}: {
  rows: StandingsRow[];
}) {
  const t = await getTranslations("Standings");
  const alEast = byDivision(rows, AL_EAST);
  if (alEast.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="font-display text-xl uppercase tracking-wide text-navy">
        {t("homeTitle")}
      </h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ScorecardFrame seedKey="al-east-standings" variant="panel">
          <div className="relative z-10 p-4">
            <h3 className="font-display text-base uppercase tracking-wide text-navy">
              {t("alEast")}
            </h3>
            <table className="mt-2 w-full border-separate border-spacing-0 text-right text-sm tabular-nums">
              <thead>
                <tr className={HEAD_ROW}>
                  <th className={TH_FIRST}>{t("team")}</th>
                  <th className={TH}>W</th>
                  <th className={TH}>L</th>
                  <th className={TH}>PCT</th>
                  <th className={TH}>GB</th>
                  <th className={TH}>L10</th>
                  <th className={TH_LAST}>STRK</th>
                </tr>
              </thead>
              <tbody>
                {alEast.map((r, i) => (
                  <tr key={r.team_id} className={`text-navy ${rowBg(r, i)}`}>
                    <td className={TD_FIRST}>
                      <TeamCell
                        teamId={r.team_id}
                        teamName={r.team_name}
                        marker={clinchMarker(r)}
                        short
                      />
                    </td>
                    <td className={TD}>{int0(r.w)}</td>
                    <td className={TD}>{int0(r.l)}</td>
                    <td className={TD}>{pct3(r.pct)}</td>
                    <td className={TD}>{gb(r.games_back)}</td>
                    <td className={TD}>{record(r.l10_w, r.l10_l)}</td>
                    <td className={TD_LAST}>{r.streak_code ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScorecardFrame>

        <ScorecardFrame seedKey="al-playoff-race" variant="panel">
          <div className="relative z-10 p-4">
            <PlayoffRace rows={rows} leagueId={AMERICAN_LEAGUE_ID} />
          </div>
        </ScorecardFrame>
      </div>

      <p className="mt-3 text-sm">
        <Link
          href="/standings"
          className="text-navy/70 underline-offset-2 transition-colors hover:text-brick hover:underline"
        >
          {t("fullStandings")}
        </Link>
      </p>
    </section>
  );
}
