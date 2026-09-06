import type { PitcherGameRow } from "./pitcher-game-log";

// P10: pure derivations over a pitcher's per-appearance log (no DB access, so
// these are trivially unit-testable). The overview page fetches the log once
// (lib/pitcher-game-log.ts) and feeds it to all three: Recent Form windows,
// the rolling-ERA sparkline, and the season summary. Mirrors batting-form.ts;
// the calendar window helper (windowByDays) is shared from there.

export type PitchingSplit = {
  games: number;
  outs: number; // innings pitched as outs; format with formatInningsPitched
  bf: number;
  h: number;
  r: number;
  er: number;
  bb: number;
  so: number;
  hr: number;
  era: number | null;
  whip: number | null;
};

const n = (v: number | null) => v ?? 0;

// Rate stats from summed counting stats.
//   ERA  = 9 * ER / IP,      IP = outs / 3
//   WHIP = (H + BB) / IP
// Both null when outs = 0 (a 0-out appearance must render "—", never Infinity).
export function summarizePitching(rows: PitcherGameRow[]): PitchingSplit {
  const s: PitchingSplit = {
    games: rows.length,
    outs: 0, bf: 0, h: 0, r: 0, er: 0, bb: 0, so: 0, hr: 0,
    era: null, whip: null,
  };

  for (const g of rows) {
    s.outs += n(g.outs_recorded);
    s.bf += n(g.bf);
    s.h += n(g.h);
    s.r += n(g.r);
    s.er += n(g.er);
    s.bb += n(g.bb);
    s.so += n(g.so);
    s.hr += n(g.hr);
  }

  if (s.outs > 0) {
    const ip = s.outs / 3;
    s.era = (9 * s.er) / ip;
    s.whip = (s.h + s.bb) / ip;
  }

  return s;
}

// Most recent `count` appearances (not starts — reliever-safe). Rows arrive
// oldest -> newest from getPitcherGameLog, so this is a tail slice.
export function lastNAppearances(
  rows: PitcherGameRow[],
  count: number,
): PitcherGameRow[] {
  return rows.slice(-count);
}

export type RollingEraPoint = { date: string; era: number };

// Trailing-window ERA per appearance (default 5). Each point aggregates the
// window's ER and outs and derives one ERA (IP-weighted), NOT a mean of
// per-game ERAs — a 0.1 IP blowup would otherwise dominate the line. Returns
// [] when there are fewer than `window` appearances so the sparkline can hide,
// and skips windows with 0 outs (no ERA defined).
export function rollingEra(
  rows: PitcherGameRow[],
  window = 5,
): RollingEraPoint[] {
  if (rows.length < window) return [];
  const out: RollingEraPoint[] = [];
  for (let i = window - 1; i < rows.length; i++) {
    const era = summarizePitching(rows.slice(i - window + 1, i + 1)).era;
    if (era != null) out.push({ date: rows[i].game_date, era });
  }
  return out;
}
