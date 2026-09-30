import type { ZoneDistribution } from "@/lib/pitch-arsenal";

// P12 M3: Savant-style zone chart, catcher's view — cells 1–9 in the zone
// (1 = top-left as the catcher sees it, row by row), 11–14 the four L-shaped
// quadrants outside it (11 top-left … 14 bottom-right). Shaded by the
// share of pitches in each cell. Built from Savant's semantic `zone`, never
// plate_x/plate_z, so two seasons can sit side by side despite the 2026
// plate-coordinate change (P12 D3). Pass the same `maxShare` to both grids so
// their shading is comparable.

const S = 168; // outer square
const IN0 = S * 0.2;
const IN1 = S * 0.8;
const CELL = (IN1 - IN0) / 3;

// Outer quadrant label anchors (the corner of each L, clear of the inner box).
const OUTER: { zone: number; x: number; y: number; lx: number; ly: number }[] = [
  { zone: 11, x: 0, y: 0, lx: IN0 / 2 + 2, ly: IN0 / 2 + 4 },
  { zone: 12, x: S / 2, y: 0, lx: S - IN0 / 2 - 2, ly: IN0 / 2 + 4 },
  { zone: 13, x: 0, y: S / 2, lx: IN0 / 2 + 2, ly: S - IN0 / 2 + 4 },
  { zone: 14, x: S / 2, y: S / 2, lx: S - IN0 / 2 - 2, ly: S - IN0 / 2 + 4 },
];

function fill(share: number | undefined, max: number): number {
  return share == null || max <= 0 ? 0 : Math.min(0.85, (share / max) * 0.85);
}

function label(share: number | undefined): string {
  return share == null ? "0%" : `${Math.round(share * 100)}%`;
}

export default function ZoneGrid({
  dist,
  maxShare,
  season,
  tone,
  caption,
}: {
  dist: ZoneDistribution;
  maxShare: number;
  season: number;
  tone: "brick" | "steel";
  caption: string; // e.g. "2,140 pitches"
}) {
  const color = tone === "brick" ? "var(--color-brick)" : "var(--color-steel)";
  return (
    <figure className="flex flex-col items-center">
      <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S} role="img" aria-label={`Pitch zone chart ${season}`}>
        {OUTER.map((o) => (
          <rect
            key={o.zone}
            x={o.x}
            y={o.y}
            width={S / 2}
            height={S / 2}
            fill={color}
            fillOpacity={fill(dist.share[o.zone], maxShare)}
            stroke="var(--color-navy)"
            strokeOpacity={0.2}
          />
        ))}
        {OUTER.map((o) => (
          <text key={`t${o.zone}`} x={o.lx} y={o.ly} textAnchor="middle" fontSize={10} fill="var(--color-navy)" fillOpacity={0.75}>
            {label(dist.share[o.zone])}
          </text>
        ))}
        <rect x={IN0} y={IN0} width={IN1 - IN0} height={IN1 - IN0} fill="var(--color-papaya)" />
        {Array.from({ length: 9 }, (_, i) => {
          const zone = i + 1;
          const x = IN0 + (i % 3) * CELL;
          const y = IN0 + Math.floor(i / 3) * CELL;
          const op = fill(dist.share[zone], maxShare);
          return (
            <g key={zone}>
              <rect x={x} y={y} width={CELL} height={CELL} fill={color} fillOpacity={op} stroke="var(--color-navy)" strokeOpacity={0.35} />
              <text
                x={x + CELL / 2}
                y={y + CELL / 2 + 4}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={op > 0.55 ? "var(--color-papaya)" : "var(--color-navy)"}
              >
                {label(dist.share[zone])}
              </text>
            </g>
          );
        })}
        <rect x={IN0} y={IN0} width={IN1 - IN0} height={IN1 - IN0} fill="none" stroke="var(--color-navy)" strokeWidth={1.5} />
      </svg>
      <figcaption className="mt-1 flex items-center gap-1.5 text-xs text-navy/60">
        <span className={`inline-block h-2 w-2 rounded-full ${tone === "brick" ? "bg-brick" : "bg-steel"}`} aria-hidden />
        <span className="font-semibold text-navy">{season}</span>
        <span>· {caption}</span>
      </figcaption>
    </figure>
  );
}
