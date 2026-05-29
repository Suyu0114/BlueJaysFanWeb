// Framework-pure: a small Rogers Centre diagram with one defensive position
// highlighted. MVP placeholder for a future hit_location heatmap (see CLAUDE.md
// — fielder_2..9 columns aren't ingested yet, so a full per-fielder heatmap is
// deferred to v2). For now we just orient the reader to where the position
// stands.

import { scaleLinear } from "d3-scale";
import {
  BASES,
  FIELD,
  FIELD_HEIGHT_FT,
  FIELD_WIDTH_FT,
  FOUL_LINES,
  MOUND,
  fairTerritoryPoints,
  foulGroundPoints,
  infieldDirtPoints,
  outfieldWallPoints,
  toPath,
  type Point,
  type Project,
} from "@/lib/field-geometry";

// Approximate standing positions in FEET, home plate at origin.
const POSITION_LOC: Record<string, Point> = {
  "1B": [55, 80],
  "2B": [50, 145],
  "3B": [-55, 80],
  SS: [-50, 145],
  LF: [-220, 280],
  CF: [0, 320],
  RF: [220, 280],
};

export default function FieldingDiagram({
  position,
  width = 320,
}: {
  position: string | null;
  width?: number;
}) {
  const height = (width * FIELD_HEIGHT_FT) / FIELD_WIDTH_FT;
  const xScale = scaleLinear([FIELD.xMin, FIELD.xMax], [0, width]);
  const yScale = scaleLinear([FIELD.yMin, FIELD.yMax], [height, 0]);
  const project: Project = (x, y) => [xScale(x), yScale(y)];
  const baseSize = width * 0.014;

  const fairPath = toPath(fairTerritoryPoints(), project, true);
  const foulPath = toPath(foulGroundPoints(), project, true);
  const dirtPath = toPath(infieldDirtPoints(), project, true);
  const wallPath = toPath(outfieldWallPoints(), project);

  const marker = position && POSITION_LOC[position];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={position ? `Field position ${position}` : "Field"}
    >
      <path d={foulPath} fill="var(--color-grass)" fillOpacity={0.25} stroke="none" />
      <path d={fairPath} fill="var(--color-grass)" fillOpacity={0.7} stroke="none" />
      <path d={dirtPath} fill="var(--color-dirt)" fillOpacity={1} stroke="none" />

      <path
        d={wallPath}
        fill="none"
        stroke="var(--color-lava)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {FOUL_LINES.map(([a, b], i) => {
        const [ax, ay] = project(a[0], a[1]);
        const [bx, by] = project(b[0], b[1]);
        return (
          <line
            key={`fl-${i}`}
            x1={ax}
            y1={ay}
            x2={bx}
            y2={by}
            stroke="var(--color-lava)"
            strokeOpacity={0.7}
            strokeWidth={1.5}
          />
        );
      })}

      {([
        [MOUND, 9],
        [BASES.home, 12],
      ] as [Point, number][]).map(([pt, rFt], i) => {
        const [px, py] = project(pt[0], pt[1]);
        const pxPerFoot = width / FIELD_WIDTH_FT;
        return (
          <circle
            key={`c-${i}`}
            cx={px}
            cy={py}
            r={rFt * pxPerFoot}
            fill="none"
            stroke="var(--color-navy)"
            strokeOpacity={0.3}
            strokeWidth={1}
          />
        );
      })}

      {[BASES.home, BASES.first, BASES.second, BASES.third].map(
        ([bxf, byf], i) => {
          const [px, py] = project(bxf, byf);
          return (
            <rect
              key={`b-${i}`}
              x={px - baseSize / 2}
              y={py - baseSize / 2}
              width={baseSize}
              height={baseSize}
              transform={`rotate(45 ${px} ${py})`}
              fill="var(--color-papaya)"
              stroke="var(--color-navy)"
              strokeOpacity={0.5}
              strokeWidth={1}
            />
          );
        },
      )}

      {marker && (() => {
        const [mxf, myf] = marker;
        const [px, py] = project(mxf, myf);
        return (
          <g>
            <circle
              cx={px}
              cy={py}
              r={14}
              fill="var(--color-brick)"
              fillOpacity={0.2}
              stroke="var(--color-brick)"
              strokeWidth={2}
            />
            <text
              x={px}
              y={py}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--color-brick)"
              fontSize={12}
              fontWeight={700}
            >
              {position}
            </text>
          </g>
        );
      })()}
    </svg>
  );
}
