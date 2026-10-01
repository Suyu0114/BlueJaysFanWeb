// Season page "Player stats": every Blue Jay's season line, one row per player,
// position players and pitchers in separate tables. PURE (no DB) — the client
// table imports it; rows come from lib/team-season-data.ts::getSeasonPlayerStats.
//
// Off / Def are FanGraphs' own definitions, summed from the WAR components the
// MLB API carries (runs above average): Off = Bat + BsR, Def = Fld + Pos (Fld
// includes catcher framing). OAA is Savant's season total across all MLB clubs.

import { formatMetric } from "./team-metrics";
import { isBatter, isPitcher, positionGroup } from "./team-season";
import type { SeasonPlayerStat } from "./team-season-data";

/** "Regulars" filter: below these a rate stat is a small sample (rows are muted). */
export const REGULAR_MIN_PA = 100;
export const REGULAR_MIN_IP = 20;

export type HitterRow = {
  mlbam_id: number;
  name: string;
  pos: string | null;
  g: number | null;
  pa: number | null;
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  hr: number | null;
  rbi: number | null;
  sb: number | null;
  wrc_plus: number | null;
  off: number | null;
  def: number | null;
  oaa: number | null;
  war: number | null;
};

export type PitcherRow = {
  mlbam_id: number;
  name: string;
  role: "SP" | "RP";
  g: number | null;
  gs: number | null;
  w: number | null;
  l: number | null;
  sv: number | null;
  ip: number | null; // baseball notation (170.1 = 170⅓): numeric order is still right
  era: number | null;
  fip: number | null;
  whip: number | null;
  k_pct: number | null;
  bb_pct: number | null;
  so: number | null;
  war: number | null;
};

const add = (a: number | null, b: number | null) => (a == null || b == null ? null : a + b);

/** Same split as the leaders and WAR by position: any PA = position player. */
export function splitPlayerStats(rows: SeasonPlayerStat[]): { hitters: HitterRow[]; pitchers: PitcherRow[] } {
  const hitters: HitterRow[] = rows.filter(isBatter).map((r) => ({
    mlbam_id: r.mlbam_id,
    name: r.name,
    pos: r.position,
    g: r.g_bat,
    pa: r.pa,
    avg: r.avg,
    obp: r.obp,
    slg: r.slg,
    ops: r.ops,
    hr: r.hr,
    rbi: r.rbi,
    sb: r.sb,
    wrc_plus: r.wrc_plus,
    off: add(r.war_batting, r.war_baserunning),
    def: add(r.war_fielding, r.war_positional),
    oaa: r.oaa,
    war: r.war,
  }));
  const pitchers: PitcherRow[] = rows.filter(isPitcher).map((r) => ({
    mlbam_id: r.mlbam_id,
    name: r.name,
    role: positionGroup({ ...r, season: 0, apps: r.g_pit }) === "SP" ? "SP" : "RP",
    g: r.g_pit,
    gs: r.gs,
    w: r.w,
    l: r.l,
    sv: r.sv,
    ip: r.ip,
    era: r.era,
    fip: r.fip,
    whip: r.whip,
    k_pct: r.k_pct,
    bb_pct: r.bb_pct,
    so: r.so,
    war: r.war,
  }));
  return { hitters, pitchers };
}

export const isRegular = {
  hitters: (r: HitterRow) => (r.pa ?? 0) >= REGULAR_MIN_PA,
  pitchers: (r: PitcherRow) => (r.ip ?? 0) >= REGULAR_MIN_IP,
};

export type SortDir = "asc" | "desc";
export type StatsTab = "hitters" | "pitchers";

/** Anchor ids the season page's leader cards link to (`#stats-hitters-hr`):
 *  the table switches to that tab and sorts by that column. */
export const statsAnchor = (tab: StatsTab, key: string) => `stats-${tab}-${key}`;
export const LEADER_ANCHORS: Record<string, string> = {
  war: statsAnchor("hitters", "war"),
  ops: statsAnchor("hitters", "ops"),
  hr: statsAnchor("hitters", "hr"),
  sb: statsAnchor("hitters", "sb"),
  era: statsAnchor("pitchers", "era"),
  whip: statsAnchor("pitchers", "whip"),
  so: statsAnchor("pitchers", "so"),
  sv: statsAnchor("pitchers", "sv"),
};

export type Column<R> = {
  key: keyof R & string;
  /** Jargon stays English in both locales; `labelKey` = a translated Season.* label. */
  label?: string;
  labelKey?: "colPlayer" | "colPos" | "colRole";
  group?: "offense" | "defense";
  /** Direction of the first click: the "better" end first (ERA low, OPS high). */
  first: SortDir;
  format: (v: unknown) => string;
};

const num = (fmt: Parameters<typeof formatMetric>[1]) => (v: unknown) => formatMetric(v as number | null, fmt);
const text = (v: unknown) => (v == null || v === "" ? "—" : String(v));
const signed1 = (v: unknown) => {
  if (v == null || !Number.isFinite(v as number)) return "—";
  const n = Math.round((v as number) * 10) / 10;
  return n > 0 ? `+${n.toFixed(1)}` : n < 0 ? `−${Math.abs(n).toFixed(1)}` : "0.0";
};
const ipFmt = (v: unknown) => (v == null ? "—" : (v as number).toFixed(1));
// WAR: one decimal, typographic minus, and no "-0.0" for a tiny negative.
const war1 = (v: unknown) => {
  if (v == null || !Number.isFinite(v as number)) return "—";
  const n = Math.round((v as number) * 10) / 10;
  return n < 0 ? `−${Math.abs(n).toFixed(1)}` : Math.abs(n).toFixed(1);
};

export const HITTER_COLUMNS: Column<HitterRow>[] = [
  { key: "name", labelKey: "colPlayer", first: "asc", format: text },
  { key: "pos", labelKey: "colPos", first: "asc", format: text },
  { key: "g", label: "G", first: "desc", format: num("int") },
  { key: "pa", label: "PA", first: "desc", format: num("int") },
  { key: "avg", label: "AVG", group: "offense", first: "desc", format: num("rate3") },
  { key: "obp", label: "OBP", group: "offense", first: "desc", format: num("rate3") },
  { key: "slg", label: "SLG", group: "offense", first: "desc", format: num("rate3") },
  { key: "ops", label: "OPS", group: "offense", first: "desc", format: num("rate3") },
  { key: "hr", label: "HR", group: "offense", first: "desc", format: num("int") },
  { key: "rbi", label: "RBI", group: "offense", first: "desc", format: num("int") },
  { key: "sb", label: "SB", group: "offense", first: "desc", format: num("int") },
  { key: "wrc_plus", label: "wRC+", group: "offense", first: "desc", format: num("int") },
  { key: "off", label: "Off", group: "offense", first: "desc", format: signed1 },
  { key: "def", label: "Def", group: "defense", first: "desc", format: signed1 },
  { key: "oaa", label: "OAA", group: "defense", first: "desc", format: num("int") },
  { key: "war", label: "WAR", first: "desc", format: war1 },
];

export const PITCHER_COLUMNS: Column<PitcherRow>[] = [
  { key: "name", labelKey: "colPlayer", first: "asc", format: text },
  { key: "role", labelKey: "colRole", first: "asc", format: text },
  { key: "g", label: "G", first: "desc", format: num("int") },
  { key: "gs", label: "GS", first: "desc", format: num("int") },
  { key: "w", label: "W", first: "desc", format: num("int") },
  { key: "l", label: "L", first: "asc", format: num("int") },
  { key: "sv", label: "SV", first: "desc", format: num("int") },
  { key: "ip", label: "IP", first: "desc", format: ipFmt },
  { key: "era", label: "ERA", first: "asc", format: num("dec2") },
  { key: "fip", label: "FIP", first: "asc", format: num("dec2") },
  { key: "whip", label: "WHIP", first: "asc", format: num("dec2") },
  { key: "k_pct", label: "K%", first: "desc", format: num("pct1") },
  { key: "bb_pct", label: "BB%", first: "asc", format: num("pct1") },
  { key: "so", label: "SO", first: "desc", format: num("int") },
  { key: "war", label: "WAR", first: "desc", format: war1 },
];

/** Rate stats: a jump from a leader card turns "Regulars" on, so a 3-PA 1.000
 *  OPS or a 0.00 ERA in two innings doesn't top the list. */
export const RATE_KEYS = new Set<string>(["avg", "obp", "slg", "ops", "wrc_plus", "era", "fip", "whip", "k_pct", "bb_pct"]);

/** Sort a copy: missing values always last (either direction); ties by WAR, then name. */
export function sortRows<R extends { name: string; war: number | null }>(
  rows: R[],
  key: keyof R & string,
  dir: SortDir,
): R[] {
  const sign = dir === "asc" ? 1 : -1;
  const cmp = (a: unknown, b: unknown) =>
    typeof a === "string" || typeof b === "string"
      ? String(a).localeCompare(String(b))
      : (a as number) - (b as number);
  return [...rows].sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (va == null || vb == null) {
      if (va != null) return -1;
      if (vb != null) return 1;
    } else {
      const c = cmp(va, vb);
      if (c !== 0) return sign * c;
    }
    return (b.war ?? -Infinity) - (a.war ?? -Infinity) || a.name.localeCompare(b.name);
  });
}
