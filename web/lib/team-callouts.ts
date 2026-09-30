import { TORONTO_TEAM_ID } from "./team-ids";
import { rankKey, tiedRank, type MetricKey } from "./team-metrics";
import type { TeamSeasonRow } from "./team-trends";

// P13 module ⑤ — PURE: what defined each season, in MLB ranks. Returns data
// only (no strings); the component labels it through the metric registry.
//
// Picked from DISTINCT team skills rather than every ranked metric: OPS / OBP /
// SLG / AVG / wOBA move together, so a "top 3" over all 45 would read "1st in
// OBP, 1st in AVG, 3rd in OPS" — one fact said three times. Order = tie-break.
export const CALLOUT_KEYS: MetricKey[] = [
  "r_per_g", // scoring
  "wrc_plus", // overall hitting
  "iso", // power
  "k_pct", // contact / strikeouts
  "bb_pct", // walks
  "sb_per_g", // speed
  "brl_pct", // quality of contact
  "hard_hit_pct",
  "ra_per_g", // run prevention
  "fip", // pitching skill
  "pit_k_bb_pct", // strikeouts minus walks
  "hr9", // homers allowed
  "pit_brl_pct", // contact allowed
  "oaa", // defense
  "sp_fip", // rotation
  "rp_fip", // bullpen
  "sp_ip_share", // rotation depth
];

// Only real strengths / weaknesses: top-10 or bottom-10 among 30 clubs. A
// 14th place is not a "strength", so a season may show fewer than three.
export const STRENGTH_MAX_RANK = 10;
export const WEAKNESS_MIN_RANK = 21;
export const CALLOUTS_PER_SIDE = 3;

export type Callout = { key: MetricKey; rank: number; tied: boolean; value: number | null };

export function seasonCallouts(
  clubs: TeamSeasonRow[],
  season: number,
  teamId = TORONTO_TEAM_ID,
): { strengths: Callout[]; weaknesses: Callout[] } {
  const me = clubs.find((r) => r.season === season && r.team_id === teamId);
  if (!me) return { strengths: [], weaknesses: [] };
  const all: Callout[] = CALLOUT_KEYS.flatMap((key) => {
    const rank = me[rankKey(key)];
    return rank == null ? [] : [{ key, rank, tied: tiedRank(clubs, season, key, rank), value: me[key] }];
  });
  const order = (k: MetricKey) => CALLOUT_KEYS.indexOf(k);
  return {
    strengths: all
      .filter((c) => c.rank <= STRENGTH_MAX_RANK)
      .sort((a, b) => a.rank - b.rank || order(a.key) - order(b.key))
      .slice(0, CALLOUTS_PER_SIDE),
    weaknesses: all
      .filter((c) => c.rank >= WEAKNESS_MIN_RANK)
      .sort((a, b) => b.rank - a.rank || order(a.key) - order(b.key))
      .slice(0, CALLOUTS_PER_SIDE),
  };
}
