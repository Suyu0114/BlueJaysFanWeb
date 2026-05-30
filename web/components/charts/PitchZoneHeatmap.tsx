// Framework-pure pitch-location heatmap. Pitcher's point of view: the catcher
// faces us, so +plate_x = batter's right = catcher's left. We mirror plate_x
// here so the chart reads from the pitcher's perspective (typical Savant view).
//
// Receives plain JSON; no next-intl / Supabase here.

import { scaleLinear } from "d3-scale";
import type { PitchEvent } from "@/components/charts/PitchDistribution";

export type PitchZoneHeatmapLabels = {
  legendLow: string;
  legendHigh: string;
};

// Drawing window in FEET, in pitcher's-eye coordinates (after mirroring plate_x).
const X_MIN = -2.0;
const X_MAX = 2.0;
// NOTE: A small number of extreme low pitches (plate_z < 0) are clipped here.
// For Gausman 2025, z_min = -1.62 but p5 = 0.51, so roughly 2–3% of pitches
// fall below this boundary and are excluded from the density calculation.
// If the heatmap ever needs to show extreme low balls, lower this to -0.5.
const Z_MIN = 0;
const Z_MAX = 5;

// Standard MLB strike zone (approximation; real zone is per-batter).
// Plate half-width plus a ball radius is the conventional outer edge.
const ZONE_X = 0.83;
const ZONE_Z_LOW = 1.5;
const ZONE_Z_HIGH = 3.5;

// Grid resolution: 16 wide x 20 tall = 0.25 ft (3 inches) per bin.
const BINS_X = 16;
const BINS_Z = 20;

// Sigma for the smoothing kernel (in bins). Slightly wider than one bin so the
// heatmap reads as continuous instead of pixelated.
const KERNEL_SIGMA = 1.1;

const PADDING = { top: 12, right: 12, bottom: 12, left: 12 };

function buildDensity(pitches: PitchEvent[]): {
  cells: number[][];
  max: number;
} {
  const cells: number[][] = Array.from({ length: BINS_Z }, () =>
    new Array<number>(BINS_X).fill(0),
  );

  // Pre-compute kernel weights (truncated at ~3 sigma).
  const radius = Math.ceil(3 * KERNEL_SIGMA);
  const kernel: number[][] = [];
  for (let dz = -radius; dz <= radius; dz++) {
    const row: number[] = [];
    for (let dx = -radius; dx <= radius; dx++) {
      row.push(
        Math.exp(-(dx * dx + dz * dz) / (2 * KERNEL_SIGMA * KERNEL_SIGMA)),
      );
    }
    kernel.push(row);
  }

  for (const p of pitches) {
    if (p.plate_x == null || p.plate_z == null) continue;
    // Pitcher's-eye: mirror plate_x (Statcast is catcher's-eye).
    const x = -p.plate_x;
    const z = p.plate_z;
    if (x < X_MIN || x > X_MAX || z < Z_MIN || z > Z_MAX) continue;
    const bx = Math.min(
      BINS_X - 1,
      Math.floor(((x - X_MIN) / (X_MAX - X_MIN)) * BINS_X),
    );
    const bz = Math.min(
      BINS_Z - 1,
      Math.floor(((z - Z_MIN) / (Z_MAX - Z_MIN)) * BINS_Z),
    );
    for (let dz = -radius; dz <= radius; dz++) {
      const zi = bz + dz;
      if (zi < 0 || zi >= BINS_Z) continue;
      const krow = kernel[dz + radius];
      const crow = cells[zi];
      for (let dx = -radius; dx <= radius; dx++) {
        const xi = bx + dx;
        if (xi < 0 || xi >= BINS_X) continue;
        crow[xi] += krow[dx + radius];
      }
    }
  }

  let max = 0;
  for (const row of cells) for (const v of row) if (v > max) max = v;
  return { cells, max };
}

// Interpolate papaya -> brick via simple linear RGB.
const PAPAYA: [number, number, number] = [0xfd, 0xf0, 0xd5];
const BRICK: [number, number, number] = [0xc1, 0x12, 0x1f];

function colorAt(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  // Ease so low-density cells fade out softly.
  const eased = Math.pow(clamped, 0.7);
  const r = Math.round(PAPAYA[0] + (BRICK[0] - PAPAYA[0]) * eased);
  const g = Math.round(PAPAYA[1] + (BRICK[1] - PAPAYA[1]) * eased);
  const b = Math.round(PAPAYA[2] + (BRICK[2] - PAPAYA[2]) * eased);
  return `rgb(${r} ${g} ${b})`;
}

export default function PitchZoneHeatmap({
  pitches,
  labels,
  width = 280,
}: {
  pitches: PitchEvent[];
  labels: PitchZoneHeatmapLabels;
  width?: number;
}) {
  const plotW = width - PADDING.left - PADDING.right;
  const plotH = (plotW * (Z_MAX - Z_MIN)) / (X_MAX - X_MIN);
  const height = plotH + PADDING.top + PADDING.bottom;

  const xScale = scaleLinear([X_MIN, X_MAX], [0, plotW]);
  const yScale = scaleLinear([Z_MIN, Z_MAX], [plotH, 0]);
  const cellW = plotW / BINS_X;
  const cellH = plotH / BINS_Z;

  const { cells, max } = buildDensity(pitches);

  const zoneX1 = xScale(-ZONE_X);
  const zoneX2 = xScale(ZONE_X);
  const zoneY1 = yScale(ZONE_Z_HIGH);
  const zoneY2 = yScale(ZONE_Z_LOW);

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full max-w-[250px]"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Pitch location heatmap"
      >
        <defs>
          <filter id="heatblur" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" />
          </filter>
        </defs>
        <g transform={`translate(${PADDING.left} ${PADDING.top})`}>
          {/* density cells (Gaussian-blurred for smoother appearance) */}
          <g filter="url(#heatblur)">
            {cells.map((row, zi) =>
              row.map((v, xi) => {
                const t = max === 0 ? 0 : v / max;
                if (t < 0.02) return null;
                return (
                  <rect
                    key={`c-${zi}-${xi}`}
                    x={xi * cellW}
                    y={(BINS_Z - 1 - zi) * cellH}
                    width={cellW + 0.5}
                    height={cellH + 0.5}
                    fill={colorAt(t)}
                    opacity={0.85}
                  />
                );
              }),
            )}
          </g>

          {/* strike zone overlay */}
          <rect
            x={zoneX1}
            y={zoneY1}
            width={zoneX2 - zoneX1}
            height={zoneY2 - zoneY1}
            fill="none"
            stroke="var(--color-navy)"
            strokeWidth={1.5}
            strokeOpacity={0.85}
          />
          {/* thirds (Savant-style 3x3 inside the zone) */}
          {[1, 2].map((i) => {
            const x = zoneX1 + ((zoneX2 - zoneX1) * i) / 3;
            return (
              <line
                key={`zvx-${i}`}
                x1={x}
                y1={zoneY1}
                x2={x}
                y2={zoneY2}
                stroke="var(--color-navy)"
                strokeOpacity={0.35}
                strokeWidth={0.8}
              />
            );
          })}
          {[1, 2].map((i) => {
            const y = zoneY1 + ((zoneY2 - zoneY1) * i) / 3;
            return (
              <line
                key={`zhz-${i}`}
                x1={zoneX1}
                y1={y}
                x2={zoneX2}
                y2={y}
                stroke="var(--color-navy)"
                strokeOpacity={0.35}
                strokeWidth={0.8}
              />
            );
          })}

          {/* home-plate shape at the bottom */}
          {(() => {
            const yPlate = yScale(0);
            const px1 = xScale(-ZONE_X);
            const px2 = xScale(ZONE_X);
            const midY = yPlate + 6;
            const tipY = yPlate + 14;
            return (
              <polygon
                points={`${px1},${yPlate} ${px2},${yPlate} ${px2},${midY} ${(px1 + px2) / 2},${tipY} ${px1},${midY}`}
                fill="var(--color-papaya)"
                stroke="var(--color-navy)"
                strokeOpacity={0.4}
                strokeWidth={1}
              />
            );
          })()}
        </g>
      </svg>

      {/* legend */}
      <div className="mt-2 flex items-center gap-2 text-[11px] text-navy/60">
        <span>{labels.legendLow}</span>
        <div
          className="h-2 w-28 rounded"
          style={{
            background: `linear-gradient(to right, ${colorAt(0)}, ${colorAt(0.5)}, ${colorAt(1)})`,
          }}
        />
        <span>{labels.legendHigh}</span>
      </div>
    </div>
  );
}
