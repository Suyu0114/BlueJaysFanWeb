import { cache, type ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import SeasonPanel from "@/components/season/SeasonPanel";
import SeasonRecordStrip from "@/components/season/SeasonRecordStrip";
import MonthlyRecordPanel from "@/components/season/MonthlyRecordPanel";
import SeasonSplitsPanel from "@/components/season/SeasonSplitsPanel";
import TeamSeasonStats from "@/components/season/TeamSeasonStats";
import PositionValueChart, { type PositionMetric, type PositionMode } from "@/components/season/PositionValueChart";
import PositionVsMlbTable from "@/components/season/PositionVsMlbTable";
import RosterCard from "@/components/RosterCard";
import { getPlayer } from "@/lib/players";
import { getStandings, TORONTO_TEAM_ID } from "@/lib/standings";
import { getTeamGames, getTeamPlayerSeasons, getTeamPositionSplits, getTeamSeasons } from "@/lib/team-season-data";
import { getTeamTrend } from "@/lib/team-trends";
import { getTeamPositionVsMlb } from "@/lib/team-position";
import { teamAbbr } from "@/lib/team-abbr";
import { POSITION_GROUPS, valueByPosition, type SplitKey } from "@/lib/team-season";
import type { MetricKey } from "@/lib/team-metrics";

// Article figures: the season page's own modules, embedded in MDX by season —
// <TeamStats season={2026} block="offense" highlight={["iso"]} />. They read
// live, through the same readers and 022 / 025 views as /season/[year], so an
// article's charts always agree with the rest of the site (the text's own
// numbers are dated by the registry's dataAsOf). Registered in
// mdx-components.tsx, so MDX files use them without imports. MDX props aren't
// type-checked: a season with no data renders a visible "no data" line rather
// than nothing, so a typo shows up in the preview.

// Per-request dedupe: an article embeds several figures of the same season.
// cache() keys on argument identity, so these take numbers, never arrays.
const seasonGames = cache(async (season: number) => {
  const seasons = await getTeamSeasons();
  if (!seasons.includes(season)) return null;
  const prior = seasons.includes(season - 1) ? season - 1 : null;
  const [games, priorGames, standings, priorStandings] = await Promise.all([
    getTeamGames(season),
    prior ? getTeamGames(prior) : Promise.resolve([]),
    getStandings(season),
    prior ? getStandings(prior) : Promise.resolve([]),
  ]);
  return games.length === 0 ? null : { prior, games, priorGames, standings, priorStandings };
});

const seasonTrend = cache((season: number, prior: number | null) =>
  getTeamTrend(prior ? [prior, season] : [season]),
);

const clubPositions = cache((season: number, teamId: number) => getTeamPositionVsMlb(season, teamId));

const seasonPlayers = cache(async (season: number, prior: number | null) => {
  const seasons = prior ? [season, prior] : [season];
  const [players, splits, vsMlb] = await Promise.all([
    getTeamPlayerSeasons(seasons),
    getTeamPositionSplits(seasons),
    clubPositions(season, TORONTO_TEAM_ID),
  ]);
  return { players, splits, vsMlb };
});

/** Any figure: content + an optional caption under it (also for non-data images). */
export function Figure({ caption, children }: { caption?: ReactNode; children: ReactNode }) {
  return (
    <figure className="my-8">
      {children}
      {caption && <figcaption className="mt-2 px-1 text-center text-xs leading-snug text-navy/55">{caption}</figcaption>}
    </figure>
  );
}

async function Missing({ season }: { season: number }) {
  const t = await getTranslations("Articles");
  return <p className="my-8 rounded-md border border-dashed border-navy/25 p-3 text-sm text-navy/55">{t("figureMissing", { season })}</p>;
}

type FigureProps = { season: number; caption?: ReactNode };

/** The record strip: record, PCT, RS / RA, run diff, x-W/L, finish, win streak — vs the prior season + MLB ranks. */
export async function SeasonRecord({ season, caption }: FigureProps) {
  const g = await seasonGames(season);
  if (!g) return <Missing season={season} />;
  const [t, locale, trend] = await Promise.all([getTranslations("Season"), getLocale(), seasonTrend(season, g.prior)]);
  return (
    <Figure caption={caption}>
      <SeasonPanel
        seedKey={`article-record-${season}`}
        season={season}
        title={t("title", { season })}
        note={g.prior ? t("subtitle", { prior: g.prior }) : t("subtitleNoPrior")}
      >
        <SeasonRecordStrip
          season={season}
          prior={g.prior}
          games={g.games}
          priorGames={g.priorGames}
          standings={g.standings}
          priorStandings={g.priorStandings}
          clubs={trend.clubs}
          locale={locale}
          className="grid grid-cols-2 gap-2 md:grid-cols-4"
        />
      </SeasonPanel>
    </Figure>
  );
}

/**
 * Team stats vs the MLB average + rank among 30: `block` = one side, `highlight` = rows the text is about,
 * `teams` = MLB team ids side by side (default: the Jays alone, with the prior season) — any club works,
 * the 022 views hold all 30.
 */
export async function TeamStats({
  season,
  block,
  highlight,
  teams,
  caption,
}: FigureProps & { block?: "offense" | "prevention"; highlight?: MetricKey[]; teams?: number[] }) {
  const ids = teams ?? [TORONTO_TEAM_ID];
  const g = await seasonGames(season);
  const trend = g ? await seasonTrend(season, g.prior) : null;
  if (!g || !trend || !ids.every((id) => trend.clubs.some((r) => r.team_id === id && r.season === season))) {
    return <Missing season={season} />;
  }
  const [t, locale] = await Promise.all([getTranslations("Season"), getLocale()]);
  return (
    <Figure caption={caption}>
      <SeasonPanel
        seedKey={`article-team-${block ?? "both"}-${season}${teams ? `-${teams.join("-")}` : ""}`}
        season={season}
        title={t("teamStatsTitle", { season })}
        note={t(ids.length > 1 ? "teamStatsNoteClubs" : "teamStatsNote")}
      >
        <TeamSeasonStats
          season={season}
          prior={g.prior}
          clubs={trend.clubs}
          mlb={trend.mlb}
          locale={locale}
          only={block}
          highlight={highlight}
          teamIds={ids}
        />
      </SeasonPanel>
    </Figure>
  );
}

/** Value by position (WAR / Off / HR / OPS), opened on `metric` / `mode`; the reader can still switch. */
export async function PositionValue({
  season,
  metric = "war",
  mode = "compare",
  caption,
}: FigureProps & { metric?: PositionMetric; mode?: PositionMode }) {
  const g = await seasonGames(season);
  const p = g ? await seasonPlayers(season, g.prior) : null;
  if (!g || !p || !p.players.some((r) => r.season === season)) return <Missing season={season} />;
  const t = await getTranslations("Season");
  const playerPrior = g.prior != null && p.players.some((r) => r.season === g.prior) ? g.prior : null;
  const byPos = valueByPosition(p.players, p.splits, season);
  const pbyPos = playerPrior ? valueByPosition(p.players, p.splits, playerPrior) : null;
  const data = POSITION_GROUPS.map((group) => ({ group, a: byPos[group], b: pbyPos ? pbyPos[group] : null }));
  return (
    <Figure caption={caption}>
      <SeasonPanel seedKey={`article-pos-${metric}-${season}`} season={season} title={t("posTitle")} note={t("posNote")}>
        <PositionValueChart
          data={data}
          season={season}
          priorSeason={playerPrior}
          vsMlb={p.vsMlb}
          initialMetric={metric}
          initialMode={mode}
        />
      </SeasonPanel>
    </Figure>
  );
}

/** HR / OPS at each position vs the MLB average + rank among 30 (025 view); `teams` as in TeamStats. */
export async function PositionVsMlb({ season, teams, caption }: FigureProps & { teams?: number[] }) {
  const g = await seasonGames(season);
  const clubs = g
    ? await Promise.all((teams ?? [TORONTO_TEAM_ID]).map(async (teamId) => ({ teamId, rows: await clubPositions(season, teamId) })))
    : [];
  if (clubs.length === 0 || clubs.some((c) => c.rows.length === 0)) return <Missing season={season} />;
  const [t, locale] = await Promise.all([getTranslations("Season"), getLocale()]);
  return (
    <Figure caption={caption}>
      <SeasonPanel seedKey={`article-pos-mlb-${season}${teams ? `-${teams.join("-")}` : ""}`} season={season} title={t("posTitle")}>
        <PositionVsMlbTable clubs={clubs} season={season} locale={locale} />
      </SeasonPanel>
    </Figure>
  );
}

/** Situational records (home / road, one-run, blowouts, vs division, vs good / bad teams) vs the prior season. */
export async function SeasonSplits({ season, highlight, caption }: FigureProps & { highlight?: SplitKey[] }) {
  const g = await seasonGames(season);
  if (!g) return <Missing season={season} />;
  const locale = await getLocale();
  return (
    <Figure caption={caption}>
      <SeasonSplitsPanel
        season={season}
        prior={g.prior}
        games={g.games}
        priorGames={g.priorGames}
        standings={g.standings}
        priorStandings={g.priorStandings}
        locale={locale}
        highlight={highlight}
      />
    </Figure>
  );
}

/** Month by month: runs per game (chart, vs the MLB average) + record and RS-RA vs the prior season (table). */
export async function MonthByMonth({ season, caption }: FigureProps) {
  const g = await seasonGames(season);
  if (!g) return <Missing season={season} />;
  const [locale, trend] = await Promise.all([getLocale(), seasonTrend(season, g.prior)]);
  return (
    <Figure caption={caption}>
      <MonthlyRecordPanel
        season={season}
        prior={g.prior}
        games={g.games}
        priorGames={g.priorGames}
        mlbRunsPerGame={trend.mlb.find((r) => r.season === season)?.r_per_g ?? null}
        locale={locale}
      />
    </Figure>
  );
}

// Static class strings (Tailwind can't see computed ones): a row of 1–3 cards stays one row on
// phones too; 4+ wrap two to a row there.
const CARD_COLS: Record<number, string> = {
  1: "mx-auto max-w-[12rem] grid-cols-1",
  2: "mx-auto max-w-md grid-cols-2",
  3: "grid-cols-3",
};
const cardCols = (n: number) => `grid gap-2 sm:gap-4 ${CARD_COLS[n] ?? "grid-cols-2 sm:grid-cols-4"}`;

/** The players page's roster cards for these players (by MLBAM id), linking to their pages. */
export async function PlayerCards({ ids, caption }: { ids: number[]; caption?: ReactNode }) {
  const players = await Promise.all(ids.map((id) => getPlayer(id)));
  const missing = ids.filter((_, i) => !players[i]);
  const t = await getTranslations("Articles");
  return (
    <Figure caption={caption}>
      <ul className={cardCols(ids.length)}>
        {players.map(
          (p) =>
            p && (
              <li key={p.mlbam_id}>
                {/* Same position rule as the all-time roster: off the 26-man, his last Jays position. */}
                <RosterCard player={p.is_active_26 ? p : { ...p, position: p.last_jays_position ?? p.position }} />
              </li>
            ),
        )}
      </ul>
      {missing.length > 0 && (
        <p className="mt-2 rounded-md border border-dashed border-navy/25 p-3 text-sm text-navy/55">
          {t("playerMissing", { ids: missing.join(", ") })}
        </p>
      )}
    </Figure>
  );
}

// Other clubs' players never enter the DB, so their cards are written into the MDX (from the
// article's data pack) and link to MLB.com; the headshot is MLB's, same URL as etl/mlb_api.py HEADSHOT_URL.
type ClubPlayer = { id: number; name: string; team: number; pos: string; bats: string; throws: string };
const headshotUrl = (id: number) => `https://midfield.mlbstatic.com/v1/people/${id}/spots/120`;
const mlbPlayerUrl = (id: number) => `https://www.mlb.com/player/${id}`;

/**
 * Roster cards for another club's players (team = MLB team id), linking to MLB.com in a steel frame.
 * With 4+ cards each club starts its own row, so a 3 + 4 split doesn't share a row.
 */
export function OtherClubPlayerCards({ players, caption }: { players: ClubPlayer[]; caption?: ReactNode }) {
  return (
    <Figure caption={caption}>
      <ul className={cardCols(players.length)}>
        {players.map((p, i) => (
          <li key={p.id} className={players.length > 3 && i > 0 && p.team !== players[i - 1].team ? "col-start-1" : undefined}>
            <RosterCard
              player={{ mlbam_id: p.id, name: p.name, position: p.pos, bats: p.bats, throws: p.throws, headshot_url: headshotUrl(p.id) }}
              club={teamAbbr(p.team)}
              href={mlbPlayerUrl(p.id)}
            />
          </li>
        ))}
      </ul>
    </Figure>
  );
}

export const ARTICLE_FIGURES = {
  Figure,
  SeasonRecord,
  TeamStats,
  PositionValue,
  PositionVsMlb,
  SeasonSplits,
  MonthByMonth,
  PlayerCards,
  OtherClubPlayerCards,
};
