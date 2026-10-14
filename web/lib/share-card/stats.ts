import { getTranslations } from "next-intl/server";
import { ordinal } from "@/lib/ordinal";
import { deltaTone, type Tone } from "@/lib/season-deltas";
import { signed, wl } from "@/lib/season-format";
import { formatMetric, METRIC, metricLabel, rankKey, tiedRank, type MetricFormat, type MetricKey } from "@/lib/team-metrics";
import { TORONTO_TEAM_ID } from "@/lib/team-ids";
import { winLoss } from "@/lib/team-season";
import { getSeasonPlayerStats, getTeamGames, getTeamSeasons } from "@/lib/team-season-data";
import { getTeamTrend } from "@/lib/team-trends";

// The numbers on a share card, read from the DB at render time through the
// site's own readers and formatters — the 022 views for team values and ranks,
// game results for the record — so a card always matches the season page.
// Nothing here computes a rate.

/** "record" (W-L, with PCT's MLB rank) or any team metric in the 022 views. */
export type CardStatKey = "record" | MetricKey;

export type CardStat = {
  label: string;
  value: string;
  delta?: { text: string; tone: Tone }; // vs the prior season, toned like the record strip
  rank?: { text: string; rank: number }; // MLB rank among 30
  prior?: string; // "2025: 94-68"
};

// A change at the metric's own precision: −.093, −0.93, −1.2 pts, +12.
function deltaText(d: number, format: MetricFormat): string {
  const sign = d > 0 ? "+" : d < 0 ? "−" : "±";
  const a = Math.abs(d);
  switch (format) {
    case "rate3":
      return sign + a.toFixed(3).replace(/^0/, "");
    case "pct1":
      return `${sign}${(100 * a).toFixed(1)} pts`;
    case "dec2":
      return sign + a.toFixed(2);
    case "dec1":
      return sign + a.toFixed(1);
    default:
      return sign + Math.round(a);
  }
}

export async function resolveCardStats(season: number, keys: CardStatKey[], locale: string): Promise<CardStat[]> {
  const seasons = await getTeamSeasons();
  const prior = seasons.includes(season - 1) ? season - 1 : null;
  const wantRecord = keys.includes("record");
  const [tS, tT, trend, games, priorGames] = await Promise.all([
    getTranslations({ locale, namespace: "Season" }),
    getTranslations({ locale, namespace: "Team" }),
    getTeamTrend(prior ? [prior, season] : [season]),
    wantRecord ? getTeamGames(season) : Promise.resolve([]),
    wantRecord && prior ? getTeamGames(prior) : Promise.resolve([]),
  ]);
  const jays = (s: number) => trend.clubs.find((r) => r.team_id === TORONTO_TEAM_ID && r.season === s);
  const me = jays(season);
  const pme = prior ? jays(prior) : undefined;
  const rankOf = (k: MetricKey) => {
    const rank = me?.[rankKey(k)];
    return rank == null ? undefined : { rank, text: ordinal(rank, locale, tiedRank(trend.clubs, season, k, rank)) };
  };
  const priorLine = (v: string | null) => (prior && v != null ? tS("priorValue", { season: prior, value: v }) : undefined);

  return keys.map((k): CardStat => {
    if (k === "record") {
      const rec = winLoss(games);
      const prec = prior ? winLoss(priorGames) : null;
      return {
        label: tS("statRecord"),
        value: wl(rec),
        delta: prec ? { text: `${signed(rec.w - prec.w)} W`, tone: deltaTone(rec.w - prec.w, "higher") } : undefined,
        rank: rankOf("pct"),
        prior: priorLine(prec ? wl(prec) : null),
      };
    }
    const def = METRIC[k];
    const v = me?.[k] ?? null;
    const pv = pme?.[k] ?? null;
    const d = v != null && pv != null ? v - pv : null;
    return {
      label: metricLabel(def, tT),
      value: formatMetric(v, def.format),
      delta: d != null ? { text: deltaText(d, def.format), tone: deltaTone(d, def.direction) } : undefined,
      rank: rankOf(k),
      prior: priorLine(pv != null ? formatMetric(pv, def.format) : null),
    };
  });
}

// ---- Baseball 101: a Blue Jay's value as the worked example ------------------

const PLAYER_STAT = {
  wrc_plus: { label: "wRC+", format: "int" },
  ops: { label: "OPS", format: "rate3" },
  avg: { label: "AVG", format: "rate3" },
  obp: { label: "OBP", format: "rate3" },
  slg: { label: "SLG", format: "rate3" },
  hr: { label: "HR", format: "int" },
  war: { label: "WAR", format: "dec1" },
  era: { label: "ERA", format: "dec2" },
  fip: { label: "FIP", format: "dec2" },
  whip: { label: "WHIP", format: "dec2" },
  k_pct: { label: "K%", format: "pct1" },
  bb_pct: { label: "BB%", format: "pct1" },
} as const satisfies Record<string, { label: string; format: MetricFormat }>;

export type PlayerStatKey = keyof typeof PLAYER_STAT;
export type PlayerExample = { player: number; stat: PlayerStatKey; seasons: number[] };
/** The Jays as a team: a 022-view metric per season, with its MLB rank among 30. */
export type TeamExample = { team: true; stat: MetricKey; seasons: number[] };
export type ResolvedExample = {
  name: string | null; // the player; null = the team (the card says so in its own words)
  label: string;
  points: { season: number; value: string; rank?: { text: string; rank: number } }[];
};

/** The team's value and MLB rank in each listed season (the 022 views, as the season page shows them). */
export async function resolveTeamExample(ex: TeamExample, locale: string): Promise<ResolvedExample | null> {
  const def = METRIC[ex.stat];
  if (!def) return null;
  const [tT, trend] = await Promise.all([getTranslations({ locale, namespace: "Team" }), getTeamTrend(ex.seasons)]);
  const points = ex.seasons.flatMap((season) => {
    const row = trend.clubs.find((r) => r.team_id === TORONTO_TEAM_ID && r.season === season);
    const v = row?.[ex.stat] ?? null;
    if (v == null) return [];
    const rank = row?.[rankKey(ex.stat)];
    return [
      {
        season,
        value: formatMetric(v, def.format),
        rank: rank == null ? undefined : { rank, text: ordinal(rank, locale, tiedRank(trend.clubs, season, ex.stat, rank)) },
      },
    ];
  });
  return points.length > 0 ? { name: null, label: metricLabel(def, tT), points } : null;
}

/** The player's value in each listed season, as a Blue Jay (web_player_season_stats). */
export async function resolvePlayerExample(ex: PlayerExample): Promise<ResolvedExample | null> {
  const def = PLAYER_STAT[ex.stat];
  const bySeason = await Promise.all(ex.seasons.map((s) => getSeasonPlayerStats(s)));
  let name: string | null = null;
  const points = ex.seasons.flatMap((season, i) => {
    const row = bySeason[i].find((r) => r.mlbam_id === ex.player);
    if (!row) return [];
    name = row.name;
    const v = row[ex.stat];
    return v == null ? [] : [{ season, value: formatMetric(v, def.format) }];
  });
  return name && points.length > 0 ? { name, label: def.label, points } : null;
}
