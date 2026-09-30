// P13 (T4/T5): the display registry for the team page — label, format, group,
// direction and how to compare with the MLB average. The NUMBERS (rates, MLB
// averages, ranks) come only from the 022 views; this file never computes one.
//
// `direction` must match the rank order in db/migrations/022_team_metric_views.sql
// (web_v_team_season: `desc` = higher is better, `asc` = lower) — change both
// together. `neutral` metrics (the batted-ball mix) have no rank and no colour.
// Labels are baseball jargon and stay English in every locale (CLAUDE.md).

import type { Direction } from "./season-deltas";

export type MetricFormat = "rate3" | "pct1" | "dec2" | "dec1" | "int" | "signed";

/**
 * How "vs MLB" reads: `ratio` = 100 × team / MLB (an index), `diff` = team − MLB
 * (club totals whose MLB mean is ~0, like OAA), `self` = already an index (wRC+).
 */
export type VsMlb = "ratio" | "diff" | "self";

export type MetricGroup =
  | "record"
  | "offense"
  | "contact"
  | "profile"
  | "prevention"
  | "contactAllowed"
  | "defense"
  | "rotation"
  | "bullpen";

export type MetricDef = {
  key: MetricKey;
  label: string;
  group: MetricGroup;
  format: MetricFormat;
  direction: Direction;
  vsMlb: VsMlb;
  /** Prose label (translated via Team.labels.<key>) rather than English jargon. */
  prose?: boolean;
};

const m = (
  key: MetricKey,
  label: string,
  group: MetricGroup,
  format: MetricFormat,
  direction: Direction,
  vsMlb: VsMlb = "ratio",
  prose = false,
): MetricDef => ({ key, label, group, format, direction, vsMlb, ...(prose ? { prose } : {}) });

export const METRIC_KEYS = [
  "pct", "run_diff",
  "r_per_g", "wrc_plus", "ops", "obp", "slg", "avg", "iso", "babip", "k_pct", "bb_pct",
  "hr_pct", "sb_per_g", "sb_pct", "whiff_pct", "bat_war",
  "brl_pct", "hard_hit_pct", "sweet_spot_pct", "avg_ev", "xwoba", "woba",
  "gb_pct", "ld_pct", "fb_pct", "pu_pct",
  "ra_per_g", "era", "fip", "whip", "pit_k_pct", "pit_bb_pct", "pit_k_bb_pct", "hr9",
  "pit_babip", "pit_whiff_pct", "pit_war",
  "pit_brl_pct", "pit_hard_hit_pct", "pit_xwoba",
  "oaa",
  "sp_era", "sp_fip", "sp_k_bb_pct", "sp_ip_share",
  "rp_era", "rp_fip", "rp_k_bb_pct",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

// Registry order = display order within a group (and the callout tie-break).
export const METRICS: MetricDef[] = [
  m("pct", "PCT", "record", "rate3", "higher"),
  m("run_diff", "Run diff", "record", "signed", "higher", "diff", true),

  m("r_per_g", "R/G", "offense", "dec2", "higher"),
  m("wrc_plus", "wRC+", "offense", "int", "higher", "self"),
  m("ops", "OPS", "offense", "rate3", "higher"),
  m("obp", "OBP", "offense", "rate3", "higher"),
  m("slg", "SLG", "offense", "rate3", "higher"),
  m("avg", "AVG", "offense", "rate3", "higher"),
  m("iso", "ISO", "offense", "rate3", "higher"),
  m("babip", "BABIP", "offense", "rate3", "higher"),
  m("k_pct", "K%", "offense", "pct1", "lower"),
  m("bb_pct", "BB%", "offense", "pct1", "higher"),
  m("hr_pct", "HR%", "offense", "pct1", "higher"),
  m("sb_per_g", "SB/G", "offense", "dec2", "higher"),
  m("sb_pct", "SB%", "offense", "pct1", "higher"),
  m("whiff_pct", "Whiff%", "offense", "pct1", "lower"),
  m("bat_war", "WAR", "offense", "dec1", "higher", "diff"),

  m("brl_pct", "Barrel%", "contact", "pct1", "higher"),
  m("hard_hit_pct", "Hard-hit%", "contact", "pct1", "higher"),
  m("sweet_spot_pct", "Sweet-spot%", "contact", "pct1", "higher"),
  m("avg_ev", "Avg EV", "contact", "dec1", "higher"),
  m("xwoba", "xwOBA", "contact", "rate3", "higher"),
  m("woba", "wOBA", "contact", "rate3", "higher"),

  m("gb_pct", "GB%", "profile", "pct1", "neutral"),
  m("ld_pct", "LD%", "profile", "pct1", "neutral"),
  m("fb_pct", "FB%", "profile", "pct1", "neutral"),
  m("pu_pct", "PU%", "profile", "pct1", "neutral"),

  m("ra_per_g", "RA/G", "prevention", "dec2", "lower"),
  m("era", "ERA", "prevention", "dec2", "lower"),
  m("fip", "FIP", "prevention", "dec2", "lower"),
  m("whip", "WHIP", "prevention", "dec2", "lower"),
  m("pit_k_pct", "K%", "prevention", "pct1", "higher"),
  m("pit_bb_pct", "BB%", "prevention", "pct1", "lower"),
  m("pit_k_bb_pct", "K-BB%", "prevention", "pct1", "higher"),
  m("hr9", "HR/9", "prevention", "dec2", "lower"),
  m("pit_babip", "BABIP", "prevention", "rate3", "lower"),
  m("pit_whiff_pct", "Whiff%", "prevention", "pct1", "higher"),
  m("pit_war", "WAR", "prevention", "dec1", "higher", "diff"),

  m("pit_brl_pct", "Barrel%", "contactAllowed", "pct1", "lower"),
  m("pit_hard_hit_pct", "Hard-hit%", "contactAllowed", "pct1", "lower"),
  m("pit_xwoba", "xwOBA", "contactAllowed", "rate3", "lower"),

  m("oaa", "OAA", "defense", "int", "higher", "diff"),

  m("sp_era", "ERA", "rotation", "dec2", "lower"),
  m("sp_fip", "FIP", "rotation", "dec2", "lower"),
  m("sp_k_bb_pct", "K-BB%", "rotation", "pct1", "higher"),
  m("sp_ip_share", "IP share", "rotation", "pct1", "higher", "ratio", true),
  m("rp_era", "ERA", "bullpen", "dec2", "lower"),
  m("rp_fip", "FIP", "bullpen", "dec2", "lower"),
  m("rp_k_bb_pct", "K-BB%", "bullpen", "pct1", "higher"),
];

export const METRIC: Record<MetricKey, MetricDef> = Object.fromEntries(
  METRICS.map((d) => [d.key, d]),
) as Record<MetricKey, MetricDef>;

export const metricsIn = (...groups: MetricGroup[]) =>
  METRICS.filter((d) => groups.includes(d.group));

export const rankKey = (k: MetricKey) => `${k}_rank` as const;

/** The label to show: jargon as-is, prose through the Team translator. */
export function metricLabel(def: MetricDef, t: (key: string) => string): string {
  return def.prose ? t(`labels.${def.key}`) : def.label;
}

const trim0 = (s: string) => (s.startsWith("0.") ? s.slice(1) : s.startsWith("-0.") ? `-${s.slice(2)}` : s);

/** Display a metric value; "—" for missing. Minus signs are typographic. */
export function formatMetric(v: number | null | undefined, format: MetricFormat): string {
  if (v == null || !Number.isFinite(v)) return "—";
  switch (format) {
    case "rate3":
      return trim0(v.toFixed(3));
    case "pct1":
      return `${(100 * v).toFixed(1)}%`;
    case "dec2":
      return v.toFixed(2);
    case "dec1":
      return v.toFixed(1);
    case "int":
      return Math.round(v).toString().replace("-", "−");
    case "signed": {
      const r = Math.round(v);
      return r > 0 ? `+${r}` : r < 0 ? `−${Math.abs(r)}` : "0";
    }
  }
}

/** "vs MLB" value per the metric's VsMlb rule (null when not computable). */
export function vsMlb(def: MetricDef, team: number | null, mlb: number | null): number | null {
  if (team == null) return null;
  if (def.vsMlb === "self") return team;
  if (mlb == null) return null;
  if (def.vsMlb === "diff") return team - mlb;
  return mlb === 0 ? null : (100 * team) / mlb;
}

/** True when another club shares this rank in the same season (shown "T-3rd"). */
export function tiedRank(
  rows: ReadonlyArray<{ season: number } & Partial<Record<string, unknown>>>,
  season: number,
  key: MetricKey,
  rank: number | null | undefined,
): boolean {
  if (rank == null) return false;
  const col = rankKey(key);
  let n = 0;
  for (const r of rows) if (r.season === season && r[col] === rank) n++;
  return n > 1;
}
