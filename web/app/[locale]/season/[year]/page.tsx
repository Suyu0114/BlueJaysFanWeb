import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import ScorecardFrame from "@/components/ScorecardFrame";
import TeamNav from "@/components/TeamNav";
import SlidingPill from "@/components/motion/SlidingPill";
import { Reveal } from "@/components/motion/Reveal";
import PlayerStatsTable, { type MlbReference } from "@/components/season/PlayerStatsTable";
import TeamSeasonStats from "@/components/season/TeamSeasonStats";
import SeasonTrendChart from "@/components/season/SeasonTrendChart";
import PositionValueChart from "@/components/season/PositionValueChart";
import PositionVsMlbTable from "@/components/season/PositionVsMlbTable";
import SeasonPanel from "@/components/season/SeasonPanel";
import SeasonRecordStrip from "@/components/season/SeasonRecordStrip";
import MonthlyRecordPanel from "@/components/season/MonthlyRecordPanel";
import SeasonSplitsPanel from "@/components/season/SeasonSplitsPanel";
import Exportable from "@/components/Exportable";
import StrengthsWeaknesses from "@/components/team/StrengthsWeaknesses";
import { getStandings, TORONTO_TEAM_ID } from "@/lib/standings";
import {
  getSeasonPlayerStats,
  getTeamGames,
  getTeamPlayerSeasons,
  getTeamPositionSplits,
  getTeamSeasons,
} from "@/lib/team-season-data";
import { LEADER_ANCHORS, splitPlayerStats } from "@/lib/season-player-stats";
import {
  gamesAboveSeries,
  LEADER_MIN_IP,
  LEADER_MIN_PA,
  POSITION_GROUPS,
  runDiffSeries,
  teamLeaders,
  valueByPosition,
  type LeaderCategory,
} from "@/lib/team-season";
import { overlayByGame } from "@/lib/season-deltas";
import { getLeagueSeason } from "@/lib/savant";
import { r3 } from "@/lib/season-format";
import { getTeamTrend } from "@/lib/team-trends";
import { getTeamPositionVsMlb } from "@/lib/team-position";

// P12 M5: the Blue Jays' regular season on one page, vs the season before —
// record, games above .500 and run differential by game number, month by
// month, splits, leaders, value by position. Game-by-game numbers come from
// web_games (game_type 'R'); x-W/L, division finish and opponents' final
// winning % from web_standings; player numbers are Jays-scoped. All the math is
// in the pure lib/team-season.ts, which P13 reuses across five seasons.
// Since P13 the page also places the season in MLB: rank chips on the record
// strip and that season's top-10 / bottom-10 skills, read from the 022 views
// (lib/team-trends.ts) — never re-ranked here.

export const revalidate = 3600;

export async function generateStaticParams() {
  const seasons = await getTeamSeasons();
  return seasons.map((s) => ({ year: String(s) }));
}

export default async function SeasonPage({
  params,
}: {
  params: Promise<{ locale: string; year: string }>;
}) {
  const { locale, year } = await params;
  setRequestLocale(locale);
  const season = Number(year);
  const seasons = await getTeamSeasons();
  if (!Number.isInteger(season) || !seasons.includes(season)) notFound();
  const prior = seasons.includes(season - 1) ? season - 1 : null;

  const t = await getTranslations("Season");

  const [games, priorGames, standings, priorStandings, players, league, trend, seasonStats, positionSplits, positionVsMlb] = await Promise.all([
    getTeamGames(season),
    prior ? getTeamGames(prior) : Promise.resolve([]),
    getStandings(season),
    prior ? getStandings(prior) : Promise.resolve([]),
    getTeamPlayerSeasons(prior ? [season, prior] : [season]),
    getLeagueSeason(season), // P12 M6: MLB-average reference for the leaders
    // P13 022 views: 30 clubs' ranks + the MLB row for this season (and the
    // prior one, for the team-stats table's comparison column)
    getTeamTrend(prior ? [prior, season] : [season]),
    getSeasonPlayerStats(season), // every Jay's season line for the player-stats table
    getTeamPositionSplits(prior ? [season, prior] : [season]), // value by position
    getTeamPositionVsMlb(season), // each position vs the MLB average + rank among 30 (025 view)
  ]);

  // MLB ranks among 30 clubs. No Jays row in the 022 views (e.g. a new season
  // before the team pulls ran) hides the chips and the "where it ranked" panel.
  const clubs = trend.clubs;
  const jaysRow = clubs.find((r) => r.team_id === TORONTO_TEAM_ID && r.season === season);
  // MLB-average reference row for the player-stats table (rate columns only),
  // the same 022 MLB row the team-stats table shows — so wRC+ is the view's
  // PA-weighted value (99 in 2025), not a hard-coded 100. The pitching rates are
  // the MLB row's pit_* columns (per BF / IP, same units as the players').
  const mlbRow = trend.mlb.find((r) => r.season === season);
  const mlbRef: MlbReference | null = mlbRow
    ? {
        hitters: { avg: mlbRow.avg ?? null, obp: mlbRow.obp ?? null, slg: mlbRow.slg ?? null, ops: mlbRow.ops ?? null, wrc_plus: mlbRow.wrc_plus ?? 100 },
        pitchers: {
          era: mlbRow.era ?? null,
          fip: mlbRow.fip ?? null,
          whip: mlbRow.whip ?? null,
          k_pct: mlbRow.pit_k_pct ?? null,
          bb_pct: mlbRow.pit_bb_pct ?? null,
        },
      }
    : null;

  // ---- series ----------------------------------------------------------------
  const above = overlayByGame(gamesAboveSeries(games), prior ? gamesAboveSeries(priorGames) : undefined, (p) => p.value);
  const rdiff = overlayByGame(runDiffSeries(games), prior ? runDiffSeries(priorGames) : undefined, (p) => p.value);

  // ---- leaders / WAR ------------------------------------------------------------
  // Player numbers (web_player_season_stats) start in 2024, while schedules and
  // standings may reach further back: hide the player modules for a season with
  // no player rows, and never compare against a prior season that has none.
  const hasPlayers = (s: number | null) => s != null && players.some((r) => r.season === s);
  const playerPrior = hasPlayers(prior) ? prior : null;
  const leaders = teamLeaders(players, season, playerPrior);
  const cats: { key: LeaderCategory; label: string; fmt: (v: number) => string }[] = [
    { key: "war", label: "WAR", fmt: (v) => v.toFixed(1) },
    { key: "ops", label: "OPS", fmt: (v) => r3(v) },
    { key: "hr", label: "HR", fmt: (v) => v.toFixed(0) },
    { key: "sb", label: "SB", fmt: (v) => v.toFixed(0) },
    // second row: pitching
    { key: "era", label: "ERA", fmt: (v) => v.toFixed(2) },
    { key: "whip", label: "WHIP", fmt: (v) => v.toFixed(2) },
    { key: "so", label: "SO", fmt: (v) => v.toFixed(0) },
    { key: "sv", label: "SV", fmt: (v) => v.toFixed(0) },
  ];
  const byPos = valueByPosition(players, positionSplits, season);
  const pbyPos = playerPrior ? valueByPosition(players, positionSplits, playerPrior) : null;
  const positionData = POSITION_GROUPS.map((g) => ({ group: g, a: byPos[g], b: pbyPos ? pbyPos[g] : null }));
  const { hitters, pitchers } = splitPlayerStats(seasonStats);

  // The record strip, month-by-month and splits modules are components of their
  // own (components/season/) so articles can embed them; the rest stay inline.
  const panel = (seedKey: string, title: string, children: React.ReactNode, note?: React.ReactNode) => (
    <SeasonPanel seedKey={seedKey} season={season} title={title} note={note}>
      {children}
    </SeasonPanel>
  );

  const legend = prior != null && (
    <span className="flex items-center gap-2 text-xs text-navy/55">
      <span className="inline-block h-0.5 w-4 bg-brick" aria-hidden />
      {season}
      <span className="inline-block w-4 border-t-2 border-dashed border-steel" aria-hidden />
      {prior}
    </span>
  );
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <TeamNav active="season" season={season} />
      <Reveal className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl uppercase tracking-wide text-navy">{t("title", { season })}</h1>
          <p className="mt-1 text-sm text-navy/60">
            {prior ? t("subtitle", { prior }) : t("subtitleNoPrior")}
          </p>
        </div>
        {seasons.length > 1 && (
          <ScorecardFrame seedKey="season-switch" variant="control" className="text-xs">
            <div role="tablist" aria-label={t("switcherLabel")} className="relative z-10 flex p-1">
              {[...seasons].sort((a, b) => a - b).map((s) => {
                const active = s === season;
                return (
                  <Link
                    key={s}
                    href={`/season/${s}`}
                    role="tab"
                    aria-selected={active}
                    className={`relative px-3 py-1 font-medium transition-colors ${active ? "text-papaya" : "text-navy/65 hover:text-navy"}`}
                  >
                    {active && <SlidingPill group="season-switch" />}
                    <span className="relative z-10">{s}</span>
                  </Link>
                );
              })}
            </div>
          </ScorecardFrame>
        )}
      </Reveal>

      {games.length === 0 ? (
        <p className="mt-8 text-navy/55">{t("empty", { season })}</p>
      ) : (
        <div className="mt-6 space-y-6">
          {/* 1. Record strip */}
          <SeasonRecordStrip
            season={season}
            prior={prior}
            games={games}
            priorGames={priorGames}
            standings={standings}
            priorStandings={priorStandings}
            clubs={clubs}
            locale={locale}
          />

          {/* 2–3. Games above .500 and run differential by game number */}
          <div className="grid gap-6 lg:grid-cols-2">
            {panel(
              "season-above",
              t("aboveTitle"),
              <>
                {legend}
                <Exportable name={`blue jays games above 500 ${season}`} caption={`Blue Jays · ${t("aboveTitle")} · ${season}${prior ? ` vs ${prior}` : ""}`}>
                  <SeasonTrendChart points={above} season={season} priorSeason={prior} labels={{ game: t("gameLabel") }} />
                </Exportable>
              </>,
              t("aboveNote"),
            )}
            {panel(
              "season-rundiff",
              t("runDiffTitle"),
              <>
                {legend}
                <Exportable name={`blue jays run differential ${season}`} caption={`Blue Jays · ${t("runDiffTitle")} · ${season}${prior ? ` vs ${prior}` : ""}`}>
                  <SeasonTrendChart points={rdiff} season={season} priorSeason={prior} labels={{ game: t("gameLabel") }} />
                </Exportable>
              </>,
              t("runDiffNote"),
            )}
          </div>

          {/* Where the season ranked in MLB (P13 callouts, this season only) */}
          {jaysRow && panel(
            "season-ranked",
            t("rankedTitle", { season }),
            <StrengthsWeaknesses seasons={[season]} clubs={clubs} locale={locale} single />,
            <Link href="/team" className="text-navy/70 transition-colors hover:text-brick">
              {t("seeTrends")}
            </Link>,
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {/* 4. Month by month: runs per game (chart) + record (table) */}
            <MonthlyRecordPanel
              season={season}
              prior={prior}
              games={games}
              priorGames={priorGames}
              mlbRunsPerGame={mlbRow?.r_per_g ?? null}
              locale={locale}
            />

            {/* 5. Splits */}
            <SeasonSplitsPanel
              season={season}
              prior={prior}
              games={games}
              priorGames={priorGames}
              standings={standings}
              priorStandings={priorStandings}
              locale={locale}
            />
          </div>

          {/* 6. The team's season line vs the MLB average + 30-club ranks (022 views) */}
          {jaysRow && panel(
            "season-team-stats",
            t("teamStatsTitle", { season }),
            <TeamSeasonStats season={season} prior={prior} clubs={clubs} mlb={trend.mlb} locale={locale} />,
            t("teamStatsNote"),
          )}

          {!hasPlayers(season) && (
            <p className="text-sm text-navy/55">{t("noPlayerData", { season })}</p>
          )}

          {/* 7. Team leaders */}
          {hasPlayers(season) && panel(
            "season-leaders",
            t("leadersTitle"),
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {cats.map((c) => (
                <div key={c.key} className="rounded-md border border-steel/20 bg-papaya/60 p-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-display text-[11px] uppercase tracking-wider text-navy/60">{c.label}</div>
                    {/* Plain hash link: PlayerStatsTable switches tab + sorts on hashchange. */}
                    <a href={`#${LEADER_ANCHORS[c.key]}`} className="text-[11px] text-navy/50 transition-colors hover:text-brick">
                      {t("leadersAll")}
                    </a>
                  </div>
                  <ol className="mt-1 space-y-1 text-sm">
                    {leaders[c.key].length === 0 && <li className="text-navy/45">—</li>}
                    {leaders[c.key].map((l) => (
                      <li key={l.mlbam_id} className="flex items-baseline justify-between gap-2">
                        <Link href={`/players/${l.mlbam_id}`} className="truncate text-navy hover:text-brick">
                          {l.name}
                        </Link>
                        <span className="shrink-0 tabular-nums">
                          <span className="font-semibold text-navy">{c.fmt(l.value)}</span>
                          {playerPrior && (
                            <span className="ml-1 text-[11px] text-navy/45">{l.prior == null ? "—" : c.fmt(l.prior)}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>,
            <>
              {playerPrior
                ? t("leadersNote", { pa: LEADER_MIN_PA, ip: LEADER_MIN_IP, prior: playerPrior })
                : t("leadersNoteNoPrior", { pa: LEADER_MIN_PA, ip: LEADER_MIN_IP })}
              {league?.ops != null && league.era != null && (
                <span className="mt-0.5 block">
                  {t("leagueRef", { season, ops: r3(league.ops), era: league.era.toFixed(2) })}
                </span>
              )}
            </>,
          )}

          {/* 8. Value by position group: WAR / Off / HR / OPS, vs the prior season, the
              change, or vs MLB (HR / OPS) — then each position vs MLB as a table. The
              table needs only the 025 view (2022 on); the chart needs player rows (2024 on). */}
          {(hasPlayers(season) || positionVsMlb.length > 0) && panel(
            "season-war",
            t("posTitle"),
            <div className="space-y-6">
              {hasPlayers(season) && (
                <div>
                  <PositionValueChart data={positionData} season={season} priorSeason={playerPrior} vsMlb={positionVsMlb} />
                  <p className="mt-2 text-[11px] leading-snug text-navy/55">{t("posNote")}</p>
                </div>
              )}
              {positionVsMlb.length > 0 && <PositionVsMlbTable rows={positionVsMlb} season={season} locale={locale} />}
            </div>,
          )}

          {/* 9. Every Jay's season line: position players (offense | defense), pitchers */}
          {hasPlayers(season) && panel(
            "season-player-stats",
            t("statsTitle", { season }),
            <PlayerStatsTable hitters={hitters} pitchers={pitchers} season={season} mlbRef={mlbRef} />,
            t("statsNote"),
          )}
        </div>
      )}
    </div>
  );
}
