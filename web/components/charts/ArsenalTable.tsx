// Framework-pure arsenal table: one row per pitch type with an inline usage
// bar (absorbs the former PitchDistribution) plus the "how good is each pitch"
// columns — Velo / Spin / Whiff% / xwOBA on contact. Receives plain JSON; no
// next-intl / Supabase here.
//
// Alignment note (db/migrations/004 + docs/DATA_MODEL.md): every column here is
// computed from release-frame or outcome fields (pitch_type, release_speed,
// spin_rate, description, estimated_woba) — no plate_x/plate_z
// so the table is plate_alignment-agnostic and safe across seasons. The sibling
// PitchZoneHeatmap is the only plate-coordinate consumer.

import { buildArsenal, type PitchEvent } from "@/lib/pitch-arsenal";
import { colorFor } from "@/lib/pitch-colors";

export type ArsenalTableLabels = {
  usage: string; // header for the usage-bar column
  pitches: string; // header for the count cell
  avgVelo: string; // header for the velocity cell
  spin: string; // header for spin rate
  whiff: string; // header for whiff%
  xwobaCon: string; // header for xwOBA on contact
};

function dec(v: number | null, d: number, suffix = ""): string {
  return v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(d)}${suffix}`;
}
function pct0(v: number | null): string {
  return v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(0)}%`;
}
// xwOBA convention: ".312" (drop the leading zero).
function woba3(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const s = v.toFixed(3);
  return s.startsWith("0.") ? s.slice(1) : s;
}

export default function ArsenalTable({
  pitches,
  labels,
}: {
  pitches: PitchEvent[];
  labels: ArsenalTableLabels;
}) {
  const rows = buildArsenal(pitches);
  if (rows.length === 0) return null;
  const maxUsage = Math.max(...rows.map((r) => r.usage));

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[2.5rem_1fr_3rem_4rem_4.5rem_3.5rem_4.5rem] items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-navy/45 sm:gap-3">
        <span>&nbsp;</span>
        <span>{labels.usage}</span>
        <span className="text-right">{labels.pitches}</span>
        <span className="text-right">{labels.avgVelo}</span>
        <span className="text-right">{labels.spin}</span>
        <span className="text-right">{labels.whiff}</span>
        <span className="text-right">{labels.xwobaCon}</span>
      </div>
      {rows.map((r) => {
        const widthPct = maxUsage === 0 ? 0 : (r.usage / maxUsage) * 100;
        return (
          <div
            key={r.pitchType}
            className="grid grid-cols-[2.5rem_1fr_3rem_4rem_4.5rem_3.5rem_4.5rem] items-center gap-2 text-sm sm:gap-3"
          >
            <span className="font-mono font-semibold text-navy">
              {r.pitchType}
            </span>
            <div
              className="relative h-5 overflow-hidden rounded bg-navy/5"
              role="img"
              aria-label={`${r.pitchType} ${(r.usage * 100).toFixed(1)} percent usage`}
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
                {(r.usage * 100).toFixed(1)}%
              </span>
            </div>
            <span className="text-right text-xs tabular-nums text-navy/60">
              {r.count}
            </span>
            <span className="text-right text-xs tabular-nums text-navy/60">
              {dec(r.avgVelo, 1)}
            </span>
            <span className="text-right text-xs tabular-nums text-navy/60">
              {r.avgSpin == null ? "—" : Math.round(r.avgSpin)}
            </span>
            <span className="text-right text-xs tabular-nums text-navy/60">
              {pct0(r.whiffPct)}
            </span>
            <span className="text-right text-xs tabular-nums text-navy/60">
              {woba3(r.xwobaCon)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
