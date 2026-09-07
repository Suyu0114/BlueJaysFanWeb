import { getTranslations, setRequestLocale } from "next-intl/server";
import ScorecardFrame from "@/components/ScorecardFrame";
import StandingsTable from "@/components/StandingsTable";
import StandingsTabs from "@/components/StandingsTabs";
import WildCardTable from "@/components/WildCardTable";
import {
  AL_DIVISIONS,
  AMERICAN_LEAGUE_ID,
  byDivision,
  DIVISION_KEY,
  getStandings,
  NATIONAL_LEAGUE_ID,
  NL_DIVISIONS,
  type StandingsRow,
} from "@/lib/standings";

// Standings move daily and the nightly ETL pings /api/revalidate anyway; 1h
// matches the home page. The view switcher is client-side (StandingsTabs), so
// the page stays statically rendered.
export const revalidate = 3600;

export default async function StandingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Standings");

  // Same offseason fallback as the home page: before the new season's feed
  // populates, show last season's final standings rather than an empty page.
  const todayET = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  let season = Number(todayET.slice(0, 4));
  let rows = await getStandings(season);
  if (rows.length === 0) {
    season -= 1;
    rows = await getStandings(season);
  }

  const divisions = (ids: readonly number[], all: StandingsRow[]) =>
    ids.map((d) => (
      <StandingsTable
        key={d}
        seedKey={`division-${d}`}
        title={t(DIVISION_KEY[d])}
        rows={byDivision(all, d)}
      />
    ));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-2xl uppercase tracking-wide text-navy">
        {t("title")}
      </h1>
      <p className="mt-1 text-sm text-navy/60">{t("subtitle", { season })}</p>

      {rows.length === 0 ? (
        <p className="mt-8 text-navy/55">{t("empty")}</p>
      ) : (
        <>
          {/* Panels are built here (server) and handed to the client tab shell
              as props, so all three views come from the one fetch above. */}
          <StandingsTabs
            al={divisions(AL_DIVISIONS, rows)}
            nl={divisions(NL_DIVISIONS, rows)}
            wcAl={
              <WildCardTable
                seedKey="wildcard-al"
                title={t("alWildCard")}
                rows={rows}
                leagueId={AMERICAN_LEAGUE_ID}
              />
            }
            wcNl={
              <WildCardTable
                seedKey="wildcard-nl"
                title={t("nlWildCard")}
                rows={rows}
                leagueId={NATIONAL_LEAGUE_ID}
              />
            }
          />

          <ScorecardFrame
            seedKey="standings-legend"
            variant="control"
            className="mt-8"
          >
            <div className="relative z-10 p-4 text-xs text-navy/70">
              <p className="font-display uppercase tracking-wide text-navy">
                {t("legendTitle")}
              </p>
              {/* Legend entries are prose, so they stay in the body face. */}
              <ul className="mt-1 space-y-0.5">
                <li>{t("legendZ")}</li>
                <li>{t("legendY")}</li>
                <li>{t("legendX")}</li>
                <li>{t("legendE")}</li>
              </ul>
            </div>
          </ScorecardFrame>
        </>
      )}
    </div>
  );
}
