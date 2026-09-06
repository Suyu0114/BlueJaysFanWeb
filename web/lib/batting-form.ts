import type { BatterGameRow } from "./batter-game-log";

// P9: pure derivations over a player's per-game batting log (no DB access, so
// these are trivially unit-testable). The overview page fetches the log once
// (lib/batter-game-log.ts) and feeds it to all three: Recent Form windows, the
// rolling-OPS sparkline, and the season summary.

export type BattingSplit = {
  games: number;
  pa: number;
  ab: number;
  r: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  so: number;
  sb: number;
  hbp: number;
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
};

const n = (v: number | null) => v ?? 0;

// Slash line from summed counting stats.
//   AVG = H/AB
//   OBP = (H+BB+HBP)/(AB+BB+HBP)  — sacrifice flies are OMITTED: web_player_game_stats
//         has no SF column, so the denominator is slightly low and OBP reads a hair
//         high (a few SF a season). IBB are already folded into BB by the box score,
//         so only SF is missing. Surfaced as a footnote on the Recent Form card.
//   SLG = TB/AB, where TB = H + 2B + 2*3B + 3*HR
export function summarize(rows: BatterGameRow[]): BattingSplit {
  const s: BattingSplit = {
    games: rows.length,
    pa: 0, ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0,
    rbi: 0, bb: 0, so: 0, sb: 0, hbp: 0,
    avg: null, obp: null, slg: null, ops: null,
  };

  for (const g of rows) {
    s.pa += n(g.pa);
    s.ab += n(g.ab);
    s.r += n(g.r);
    s.h += n(g.h);
    s.doubles += n(g.doubles);
    s.triples += n(g.triples);
    s.hr += n(g.hr);
    s.rbi += n(g.rbi);
    s.bb += n(g.bb);
    s.so += n(g.so);
    s.sb += n(g.sb);
    s.hbp += n(g.hbp);
  }

  if (s.ab > 0) {
    s.avg = s.h / s.ab;
    const tb = s.h + s.doubles + 2 * s.triples + 3 * s.hr;
    s.slg = tb / s.ab;
  }
  const onBaseDenom = s.ab + s.bb + s.hbp;
  if (onBaseDenom > 0) {
    s.obp = (s.h + s.bb + s.hbp) / onBaseDenom;
  }
  if (s.obp != null && s.slg != null) {
    s.ops = s.obp + s.slg;
  }

  return s;
}

// Shift a 'YYYY-MM-DD' date by `delta` days in UTC (avoids local-tz drift).
function shiftDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

// Games within the last `days` days ending at `asOf` (inclusive of asOf, a
// rolling window). game_date is 'YYYY-MM-DD' so string compare is date-correct.
// Generic over the row shape so the pitcher log (lib/pitching-form.ts) can
// reuse the same window logic.
export function windowByDays<T extends { game_date: string }>(
  rows: T[],
  days: number,
  asOf: string,
): T[] {
  const cutoff = shiftDays(asOf, -days);
  return rows.filter((g) => g.game_date > cutoff);
}

export type RollingOpsPoint = { date: string; ops: number };

// Trailing-window OPS per game (default 15). Returns [] when there are fewer
// than `window` games so the sparkline can be hidden for small samples.
export function rollingOps(
  rows: BatterGameRow[],
  window = 15,
): RollingOpsPoint[] {
  if (rows.length < window) return [];
  const out: RollingOpsPoint[] = [];
  for (let i = window - 1; i < rows.length; i++) {
    const slice = rows.slice(i - window + 1, i + 1);
    const ops = summarize(slice).ops;
    if (ops != null) out.push({ date: rows[i].game_date, ops });
  }
  return out;
}
