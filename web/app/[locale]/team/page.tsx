import { getTranslations, setRequestLocale } from "next-intl/server";
import Exportable from "@/components/Exportable";
import { Reveal } from "@/components/motion/Reveal";
import LuckTable from "@/components/team/LuckTable";
import RankKey from "@/components/team/RankKey";
import RunSourcesChart from "@/components/team/RunSourcesChart";
import SeasonStrip from "@/components/team/SeasonStrip";
import TeamPanel, { PanelBlock } from "@/components/team/TeamPanel";
import { ordinal } from "@/lib/ordinal";
import { TORONTO_TEAM_ID } from "@/lib/standings";
import { tiedRank } from "@/lib/team-metrics";
import { postseasonResult, seasonSplits, type PostseasonResult, type WinLoss } from "@/lib/team-season";
import { getTeamGames } from "@/lib/team-season-data";
import { getPostseasonGames, getTeamTrend, getTrendSeasons, type TeamSeasonRow } from "@/lib/team-trends";

// P13: the Blue Jays over five seasons from a team / analyst angle — every
// number next to the MLB average and the Jays' rank among 30 clubs. Rates,
// MLB averages and ranks come only from the 022 views (lib/team-trends.ts);
// game-level splits reuse P12's pure lib/team-season.ts per season.
// Modules: season strip, ① record & run differential (N2); ② offense,
// ③ run prevention, ④ trajectory & splits, ⑤ callouts, ⑥ glossary follow.

export const revalidate = 3600;

/** Split context for one season from its 30-club rows (division + final pct). */
function splitContext(clubs: TeamSeasonRow[]) {
  const me = clubs.find((r) => r.team_id === TORONTO_TEAM_ID);
  return {
    ownDivision: me?.division_id ?? 201,
    divisionOf: new Map(clubs.filter((r) => r.division_id != null).map((r) => [r.team_id, r.division_id as number])),
    pctOf: new Map(clubs.filter((r) => r.pct != null).map((r) => [r.team_id, r.pct as number])),
  };
}

export default async function TeamPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Team");

  const seasons = await getTrendSeasons();
  const [{ clubs }, postGames, games] = await Promise.all([
    getTeamTrend(seasons),
    getPostseasonGames(seasons),
    Promise.all(seasons.map((s) => getTeamGames(s))),
  ]);
  const jays = clubs.filter((r) => r.team_id === TORONTO_TEAM_ID).sort((a, b) => a.season - b.season);

  if (jays.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="font-display text-2xl uppercase tracking-wide text-navy">{t("titleEmpty")}</h1>
        <p className="mt-4 text-navy/55">{t("empty")}</p>
      </div>
    );
  }

  const first = jays[0].season;
  const last = jays[jays.length - 1].season;

  const post: Record<number, PostseasonResult> = Object.fromEntries(
    seasons.map((s) => [s, postseasonResult(postGames.filter((g) => g.season === s))]),
  );
  const oneRun: Record<number, WinLoss> = Object.fromEntries(
    seasons.map((s, i) => [s, seasonSplits(games[i], splitContext(clubs.filter((r) => r.season === s))).oneRun]),
  );
  const runDiffTies: Record<number, boolean> = Object.fromEntries(
    jays.map((r) => [r.season, tiedRank(clubs, r.season, "run_diff", r.run_diff_rank)]),
  );

  const sources = jays.map((r) => ({
    season: String(r.season),
    offense: Math.round(r.offense_runs ?? 0),
    prevention: Math.round(r.prevention_runs ?? 0),
    net: r.run_diff ?? 0,
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Reveal className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl uppercase tracking-wide text-navy">{t("title", { from: first, to: last })}</h1>
          <p className="mt-1 max-w-2xl text-sm text-navy/60">{t("subtitle")}</p>
        </div>
        <RankKey label={t("rankKey")} best={ordinal(1, locale)} worst={ordinal(30, locale)} />
      </Reveal>

      <div className="mt-6 space-y-6">
        <SeasonStrip rows={jays} post={post} runDiffTies={runDiffTies} locale={locale} />

        {/* ① Record & run differential */}
        <TeamPanel seedKey="team-record" title={t("recordTitle")} question={t("recordQuestion")}>
          <div className="grid gap-6 lg:grid-cols-2">
            <PanelBlock title={t("sourcesTitle")} note={t("sourcesNote")}>
              <Exportable
                name={`blue jays run sources ${first}-${last}`}
                caption={`Blue Jays · ${t("sourcesTitle")} · ${first}–${last}`}
              >
                <RunSourcesChart
                  data={sources}
                  labels={{ offense: t("sourcesOffense"), prevention: t("sourcesPrevention"), net: t("sourcesNet") }}
                />
              </Exportable>
            </PanelBlock>
            <LuckTable rows={jays} oneRun={oneRun} rankTies={runDiffTies} locale={locale} />
          </div>
        </TeamPanel>
      </div>
    </div>
  );
}
