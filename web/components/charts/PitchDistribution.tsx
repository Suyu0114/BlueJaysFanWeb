// Framework-pure horizontal bars: pitch-type usage with avg release speed.
// Receives plain JSON; no next-intl / Supabase here.

export type PitchEvent = {
  id: string;
  pitch_type: string | null;
  release_speed: number | null;
  plate_x: number | null;
  plate_z: number | null;
  stand: string | null; // batter handedness: "L" | "R"
  game_date: string; // YYYY-MM-DD
};

export type PitchDistributionLabels = {
  pitches: string; // column header for the count cell
  avgVelo: string; // column header for the velocity cell
};

// Stable color per pitch family, drawn from the brand palette so the chart
// shares the language of the rest of the site.
const PITCH_COLOR: Record<string, string> = {
  FF: "var(--color-brick)", // four-seam fastball
  FT: "var(--color-brick)", // two-seam (legacy code) — same family
  SI: "var(--color-lava)", // sinker
  FC: "var(--color-lava)", // cutter
  SL: "var(--color-navy)", // slider
  ST: "var(--color-navy)", // sweeper
  CU: "var(--color-steel)", // curve
  KC: "var(--color-steel)", // knuckle-curve
  CH: "var(--color-grass)", // change-up
  FS: "var(--color-grass)", // splitter
  SC: "var(--color-grass)", // screwball
};

const FALLBACK_COLOR = "var(--color-navy)";

function colorFor(pitchType: string): string {
  return PITCH_COLOR[pitchType] ?? FALLBACK_COLOR;
}

type Row = {
  pitchType: string;
  count: number;
  pct: number;
  avgVelo: number | null;
};

function buildRows(pitches: PitchEvent[]): Row[] {
  const groups = new Map<string, { count: number; veloSum: number; veloN: number }>();
  for (const p of pitches) {
    const pt = p.pitch_type;
    if (!pt) continue;
    const g = groups.get(pt) ?? { count: 0, veloSum: 0, veloN: 0 };
    g.count += 1;
    if (p.release_speed != null) {
      g.veloSum += p.release_speed;
      g.veloN += 1;
    }
    groups.set(pt, g);
  }
  const total = [...groups.values()].reduce((a, g) => a + g.count, 0);
  return [...groups.entries()]
    .map(([pitchType, g]) => ({
      pitchType,
      count: g.count,
      pct: total === 0 ? 0 : g.count / total,
      avgVelo: g.veloN === 0 ? null : g.veloSum / g.veloN,
    }))
    .sort((a, b) => b.count - a.count);
}

export default function PitchDistribution({
  pitches,
  labels,
}: {
  pitches: PitchEvent[];
  labels: PitchDistributionLabels;
}) {
  const rows = buildRows(pitches);
  if (rows.length === 0) {
    return null;
  }
  const maxPct = Math.max(...rows.map((r) => r.pct));

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[3rem_1fr_3.5rem_4.5rem] items-center gap-3 text-[10px] font-semibold uppercase tracking-wide text-navy/45">
        <span>&nbsp;</span>
        <span>&nbsp;</span>
        <span className="text-right">{labels.pitches}</span>
        <span className="text-right">{labels.avgVelo}</span>
      </div>
      {rows.map((r) => {
        const widthPct = maxPct === 0 ? 0 : (r.pct / maxPct) * 100;
        return (
          <div
            key={r.pitchType}
            className="grid grid-cols-[3rem_1fr_3.5rem_4.5rem] items-center gap-3 text-sm"
          >
            <span className="font-mono font-semibold text-navy">{r.pitchType}</span>
            <div
              className="relative h-5 overflow-hidden rounded bg-navy/5"
              role="img"
              aria-label={`${r.pitchType} ${(r.pct * 100).toFixed(1)} percent`}
            >
              <div
                className="h-full rounded"
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: colorFor(r.pitchType),
                  opacity: 0.85,
                }}
              />
              <span className="absolute inset-y-0 left-2 flex items-center text-xs font-medium text-papaya mix-blend-luminosity">
                {(r.pct * 100).toFixed(1)}%
              </span>
            </div>
            <span className="text-right text-xs tabular-nums text-navy/60">
              {r.count}
            </span>
            <span className="text-right text-xs tabular-nums text-navy/60">
              {r.avgVelo == null ? "—" : `${r.avgVelo.toFixed(1)} mph`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
