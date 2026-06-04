import type { BattedBallEvent } from "@/components/charts/SprayChart";

export type ExitVeloStats = {
  totalBattedBalls: number; // all in-play events (the full array length)
  withEV: number; // subset with a non-null launch_speed
  avgEV: number | null; // mean exit velocity (over withEV)
  maxEV: number | null; // max exit velocity
  hardHitPct: number | null; // % of withEV events with launch_speed >= 95
};

// Statcast's hard-hit threshold.
const HARD_HIT_MPH = 95;

// Pure: computed client-side from the *filtered* events so the KPI chips always
// reflect the current filter subset. Note `hardHitPct`'s denominator follows the
// outcome filter (selecting outcome=hr makes it "% of HRs that were hard-hit") —
// honest, but the surrounding label must not imply a season-wide rate.
export function computeExitVeloStats(
  events: BattedBallEvent[],
): ExitVeloStats {
  const speeds = events
    .map((e) => e.launch_speed)
    .filter((s): s is number => s != null);

  const withEV = speeds.length;
  if (withEV === 0) {
    return {
      totalBattedBalls: events.length,
      withEV: 0,
      avgEV: null,
      maxEV: null,
      hardHitPct: null,
    };
  }

  const sum = speeds.reduce((acc, s) => acc + s, 0);
  const hardHit = speeds.filter((s) => s >= HARD_HIT_MPH).length;

  return {
    totalBattedBalls: events.length,
    withEV,
    avgEV: sum / withEV,
    maxEV: Math.max(...speeds),
    hardHitPct: (hardHit / withEV) * 100,
  };
}
