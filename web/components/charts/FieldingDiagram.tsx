// Framework-pure: a small Rogers Centre diagram with one or more defensive
// positions highlighted. MVP placeholder for a future hit_location heatmap
// (see CLAUDE.md — fielder_2..9 columns aren't ingested yet, so a full
// per-fielder heatmap is deferred to v2). For now we just orient the reader.

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
  polar,
  toPath,
  type Point,
  type Project,
} from "@/lib/field-geometry";

// Standing positions in FEET (home plate at origin, +y to CF, +x to RF).
// Outfield spots are placed via polar(azimuth, distance) so they stay inside
// the curved wall (which reaches ~328' down the lines and ~400' to CF).
const POSITION_LOC: Record<string, Point> = {
  "1B": polar(30, 95),
  "2B": polar(20, 155),
  "3B": polar(-30, 95),
  SS: polar(-20, 155),
  LF: polar(-28, 290),
  CF: polar(0, 320),
  RF: polar(28, 290),
  C: polar(0, -8),
  P: [MOUND[0], MOUND[1]],
};

type Props = {
  // Ordered list of positions to show; first one is primary unless `primary`
  // is set explicitly.
  positions: string[];
  primary?: string;
  width?: number;
};

export default function FieldingDiagram({
  positions,
  primary,
  width = 320,
}: Props) {
  const height = (width * FIELD_HEIGHT_FT) / FIELD_WIDTH_FT;
  const xScale = scaleLinear([FIELD.xMin, FIELD.xMax], [0, width]);
  const yScale = scaleLinear([FIELD.yMin, FIELD.yMax], [height, 0]);
  const project: Project = (x, y) => [xScale(x), yScale(y)];
  const baseSize = width * 0.014;

  const fairPath = toPath(fairTerritoryPoints(), project, true);
  const foulPath = toPath(foulGroundPoints(), project, true);
  const dirtPath = toPath(infieldDirtPoints(), project, true);
  const wallPath = toPath(outfieldWallPoints(), project);

  const known = positions.filter((p) => POSITION_LOC[p]);
  const primaryPos = primary && known.includes(primary) ? primary : known[0];
  const secondaries = known.filter((p) => p !== primaryPos);
  const ariaLabel = primaryPos
    ? `Field positions: ${[primaryPos, ...secondaries].join(", ")}`
    : "Field";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
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

      {/* Secondary chips first so the primary draws on top. */}
      {secondaries.map((pos) => (
        <PositionChip
          key={`sec-${pos}`}
          pos={pos}
          project={project}
          color="var(--color-steel)"
          radius={11}
          fillOpacity={0.18}
          strokeWidth={1.5}
          fontSize={10}
        />
      ))}
      {primaryPos && (
        <PositionChip
          pos={primaryPos}
          project={project}
          color="var(--color-brick)"
          radius={14}
          fillOpacity={0.22}
          strokeWidth={2}
          fontSize={12}
        />
      )}
    </svg>
  );
}

function PositionChip({
  pos,
  project,
  color,
  radius,
  fillOpacity,
  strokeWidth,
  fontSize,
}: {
  pos: string;
  project: Project;
  color: string;
  radius: number;
  fillOpacity: number;
  strokeWidth: number;
  fontSize: number;
}) {
  const loc = POSITION_LOC[pos];
  if (!loc) return null;
  const [px, py] = project(loc[0], loc[1]);
  return (
    <g>
      <circle
        cx={px}
        cy={py}
        r={radius}
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <text
        x={px}
        y={py}
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        fontSize={fontSize}
        fontWeight={700}
      >
        {pos}
      </text>
    </g>
  );
}
