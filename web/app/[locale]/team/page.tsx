import { getTranslations, setRequestLocale } from "next-intl/server";
import Exportable from "@/components/Exportable";
import ContactLuck from "@/components/team/ContactLuck";
import EraFipGap from "@/components/team/EraFipGap";
import { Reveal } from "@/components/motion/Reveal";
import LuckTable from "@/components/team/LuckTable";
import RankGrid from "@/components/team/RankGrid";
import RankKey from "@/components/team/RankKey";
import RotationBullpenTable from "@/components/team/RotationBullpenTable";
import RunSourcesChart from "@/components/team/RunSourcesChart";
import SeasonStrip from "@/components/team/SeasonStrip";
import SeasonTrajectoryChart from "@/components/team/SeasonTrajectoryChart";
import StrengthsWeaknesses from "@/components/team/StrengthsWeaknesses";
import TeamGlossary from "@/components/team/TeamGlossary";
import TeamPanel, { PanelBlock } from "@/components/team/TeamPanel";
import TeamNav from "@/components/TeamNav";
import TeamSplitsTable from "@/components/team/TeamSplitsTable";
import TrendSmallMultiples from "@/components/team/TrendSmallMultiples";
import { ordinal } from "@/lib/ordinal";
import { mergeByGame } from "@/lib/season-deltas";
import { DIVISION_KEY, TORONTO_TEAM_ID } from "@/lib/standings";
import { buildGrid, toTrends } from "@/lib/team-grid";
import { metricsIn, tiedRank } from "@/lib/team-metrics";
import { gamesAboveSeries, postseasonResult, seasonSplits, type PostseasonResult, type WinLoss } from "@/lib/team-season";
import { getLatestTeamSeason, getTeamGames } from "@/lib/team-season-data";
import { getPostseasonGames, getTeamTrend, getTrendSeasons, type TeamSeasonRow } from "@/lib/team-trends";

// P13: the Blue Jays over five seasons from a team / analyst angle — every
// number next to the MLB average and the Jays' rank among 30 clubs. Rates,
// MLB averages and ranks come only from the 022 views (lib/team-trends.ts);
// game-level splits reuse P12's pure lib/team-season.ts per season.
// Modules: season strip, ① record & run differential (N2), ② offense (N3),
// ③ run prevention (N4), ④ trajectory & splits (N5), ⑤ strengths & weaknesses,
// ⑥ glossary & method (N6).

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
  const tst = await getTranslations("Standings");

  const seasons = await getTrendSeasons();
  const [{ clubs, mlb }, postGames, games, latestSeason] = await Promise.all([
    getTeamTrend(seasons),
    getPostseasonGames(seasons),
    Promise.all(seasons.map((s) => getTeamGames(s))),
    getLatestTeamSeason(), // the TeamNav season tab: the same newest season as the header menu
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
  // Situational records per season (P12's seasonSplits, the /season/[year] numbers).
  const splitsBySeason = seasons.map((s, i) => ({
    season: s,
    splits: seasonSplits(games[i], splitContext(clubs.filter((r) => r.season === s))),
  }));
  const oneRun: Record<number, WinLoss> = Object.fromEntries(splitsBySeason.map((x) => [x.season, x.splits.oneRun]));
  const runDiffTies: Record<number, boolean> = Object.fromEntries(
    jays.map((r) => [r.season, tiedRank(clubs, r.season, "run_diff", r.run_diff_rank)]),
  );

  // ② offense: run scoring + Statcast contact quality + the (unranked) batted-ball mix
  const offenseGrid = buildGrid(metricsIn("offense", "contact", "profile"), clubs, mlb, seasons);
  const offenseTrends = toTrends(offenseGrid, ["wrc_plus", "k_pct", "bb_pct", "brl_pct"]);
  const span = `${first}–${last}`;

  // ③ run prevention: pitching + Statcast contact allowed + team defense (OAA)
  const preventionGrid = buildGrid(metricsIn("prevention", "contactAllowed", "defense"), clubs, mlb, seasons);
  const preventionTrends = toTrends(preventionGrid, ["ra_per_g", "fip", "pit_k_bb_pct", "pit_hard_hit_pct"]);

  // ④ games above .500 by game number, every season lined up (mergeByGame).
  const series = seasons.map((s, i) => ({ key: `y${s}`, points: gamesAboveSeries(games[i]) }));
  const trajRows = mergeByGame(series, (p) => p.value).map((r) => ({
    game: r.game,
    ...Object.fromEntries(series.map((x) => [x.key, r.values[x.key] ?? null])),
  }));
  const lastIndexOf = (key: string) => {
    for (let i = trajRows.length - 1; i >= 0; i--) if ((trajRows[i] as Record<string, unknown>)[key] != null) return i;
    return -1;
  };
  const trajSeasons = jays.map((r) => ({
    season: r.season,
    key: `y${r.season}`,
    record: `${r.w ?? "—"}-${r.l ?? "—"}`,
    lastIndex: lastIndexOf(`y${r.season}`),
  }));
  const division = tst(DIVISION_KEY[jays[jays.length - 1].division_id ?? 201] ?? "alEast");

  const sources = jays.map((r) => ({
    season: String(r.season),
    offense: Math.round(r.offense_runs ?? 0),
    prevention: Math.round(r.prevention_runs ?? 0),
    net: r.run_diff ?? 0,
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      {latestSeason != null && <TeamNav active="trends" season={latestSeason} />}
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

        {/* ② Offense vs MLB */}
        <TeamPanel seedKey="team-offense" title={t("offenseTitle")} question={t("offenseQuestion")}>
          <div className="space-y-6">
            <PanelBlock title={t("gridTitle")}>
              <RankGrid seedKey="team-offense-grid" rows={offenseGrid} seasons={seasons} copyName={t("offenseTitle")} />
            </PanelBlock>
            <PanelBlock title={t("trendsTitle")} note={t("trendsNote")}>
              <TrendSmallMultiples items={offenseTrends} span={span} />
            </PanelBlock>
            <PanelBlock title={t("contactLuckTitle")} note={t("contactLuckNote")}>
              <ContactLuck rows={jays} />
            </PanelBlock>
          </div>
        </TeamPanel>

        {/* ③ Run prevention vs MLB */}
        <TeamPanel seedKey="team-prevention" title={t("preventionTitle")} question={t("preventionQuestion")}>
          <div className="space-y-6">
            <PanelBlock title={t("gridTitle")}>
              <RankGrid seedKey="team-prevention-grid" rows={preventionGrid} seasons={seasons} copyName={t("preventionTitle")} />
            </PanelBlock>
            <RotationBullpenTable rows={jays} clubs={clubs} locale={locale} />
            <PanelBlock title={t("trendsTitle")} note={t("preventionTrendsNote")}>
              <TrendSmallMultiples items={preventionTrends} span={span} />
            </PanelBlock>
            <PanelBlock title={t("eraFipTitle")} note={t("eraFipNote")}>
              <EraFipGap rows={jays} clubs={clubs} locale={locale} />
            </PanelBlock>
          </div>
        </TeamPanel>

        {/* ④ Game by game & splits */}
        <TeamPanel seedKey="team-trajectory" title={t("trajectoryTitle")} question={t("trajectoryQuestion")}>
          <div className="space-y-6">
            <PanelBlock title={t("aboveTitle")} note={t("aboveNote")}>
              <SeasonTrajectoryChart
                rows={trajRows}
                seasons={trajSeasons}
                initial={last}
                exportName={`blue jays games above 500 ${first}-${last}`}
                exportCaption={`Blue Jays · ${t("aboveTitle")} · ${span}`}
              />
            </PanelBlock>
            <TeamSplitsTable seasons={splitsBySeason} division={division} />
          </div>
        </TeamPanel>

        {/* ⑤ Strengths & weaknesses */}
        <TeamPanel seedKey="team-callouts" title={t("calloutsPanelTitle")} question={t("calloutsQuestion")}>
          <StrengthsWeaknesses seasons={seasons} clubs={clubs} locale={locale} />
        </TeamPanel>

        {/* ⑥ Glossary & method */}
        <TeamPanel seedKey="team-glossary" title={t("glossaryTitle")} question={t("glossaryQuestion")}>
          <TeamGlossary />
        </TeamPanel>
      </div>
    </div>
  );
}
