import { cache, type ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import SeasonPanel from "@/components/season/SeasonPanel";
import SeasonRecordStrip from "@/components/season/SeasonRecordStrip";
import MonthlyRecordPanel from "@/components/season/MonthlyRecordPanel";
import SeasonSplitsPanel from "@/components/season/SeasonSplitsPanel";
import TeamSeasonStats from "@/components/season/TeamSeasonStats";
import PositionValueChart, { type PositionMetric, type PositionMode } from "@/components/season/PositionValueChart";
import PositionVsMlbTable from "@/components/season/PositionVsMlbTable";
import { getStandings, TORONTO_TEAM_ID } from "@/lib/standings";
import { getTeamGames, getTeamPlayerSeasons, getTeamPositionSplits, getTeamSeasons } from "@/lib/team-season-data";
import { getTeamTrend } from "@/lib/team-trends";
import { getTeamPositionVsMlb } from "@/lib/team-position";
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

const seasonPlayers = cache(async (season: number, prior: number | null) => {
  const seasons = prior ? [season, prior] : [season];
  const [players, splits, vsMlb] = await Promise.all([
    getTeamPlayerSeasons(seasons),
    getTeamPositionSplits(seasons),
    getTeamPositionVsMlb(season),
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

/** Team stats vs the MLB average + rank among 30: `block` = one side, `highlight` = rows the text is about. */
export async function TeamStats({
  season,
  block,
  highlight,
  caption,
}: FigureProps & { block?: "offense" | "prevention"; highlight?: MetricKey[] }) {
  const g = await seasonGames(season);
  const trend = g ? await seasonTrend(season, g.prior) : null;
  if (!g || !trend?.clubs.some((r) => r.team_id === TORONTO_TEAM_ID && r.season === season)) return <Missing season={season} />;
  const [t, locale] = await Promise.all([getTranslations("Season"), getLocale()]);
  return (
    <Figure caption={caption}>
      <SeasonPanel seedKey={`article-team-${block ?? "both"}-${season}`} season={season} title={t("teamStatsTitle", { season })} note={t("teamStatsNote")}>
        <TeamSeasonStats season={season} prior={g.prior} clubs={trend.clubs} mlb={trend.mlb} locale={locale} only={block} highlight={highlight} />
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

/** HR / OPS at each position vs the MLB average + rank among 30 (025 view). */
export async function PositionVsMlb({ season, caption }: FigureProps) {
  const g = await seasonGames(season);
  const p = g ? await seasonPlayers(season, g.prior) : null;
  if (!p || p.vsMlb.length === 0) return <Missing season={season} />;
  const [t, locale] = await Promise.all([getTranslations("Season"), getLocale()]);
  return (
    <Figure caption={caption}>
      <SeasonPanel seedKey={`article-pos-mlb-${season}`} season={season} title={t("posTitle")}>
        <PositionVsMlbTable rows={p.vsMlb} season={season} locale={locale} />
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

export const ARTICLE_FIGURES = { Figure, SeasonRecord, TeamStats, PositionValue, PositionVsMlb, SeasonSplits, MonthByMonth };
