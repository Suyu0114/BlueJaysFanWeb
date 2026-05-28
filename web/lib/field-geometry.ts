// Stylized Rogers Centre geometry for the spray chart.
//
// Coordinate system is in FEET, matching the ETL transform stored in
// web_statcast_events (hc_x_feet / hc_y_feet):
//   - home plate at (0, 0)
//   - +y points to straight-away center field
//   - +x points toward right field, -x toward left field
//
// This module is framework-pure: it only produces geometry in feet and tiny
// SVG-path helpers. Consumers supply their own feet->pixel projector.

export type Project = (xFeet: number, yFeet: number) => [number, number];

export const FIELD = {
  // Visible drawing frame in feet (also fixes the chart aspect ratio).
  xMin: -250,
  xMax: 250,
  yMin: -45,
  yMax: 420,
  // Fence distances (Rogers Centre): foul lines 328', center field 400'.
  lineLF: 328,
  lineRF: 328,
  centerCF: 400,
  baseDistance: 90,
} as const;

export const FIELD_WIDTH_FT = FIELD.xMax - FIELD.xMin;
export const FIELD_HEIGHT_FT = FIELD.yMax - FIELD.yMin;

const DEG = Math.PI / 180;

// Azimuth measured from +y (dead center), positive toward right field.
function polar(thetaDeg: number, dist: number): [number, number] {
  const t = thetaDeg * DEG;
  return [dist * Math.sin(t), dist * Math.cos(t)];
}

export const LEFT_FOUL_POLE = polar(-45, FIELD.lineLF);
export const RIGHT_FOUL_POLE = polar(45, FIELD.lineRF);

export const BASES = {
  home: [0, 0] as [number, number],
  first: polar(45, FIELD.baseDistance),
  second: polar(0, FIELD.baseDistance * Math.SQRT2),
  third: polar(-45, FIELD.baseDistance),
};

// Outfield wall sampled as a circular arc through both foul poles and the
// center-field point. Assumes a symmetric park (LF ~= RF), true for Rogers
// Centre (328/328).
export function outfieldWallPoints(steps = 48): [number, number][] {
  const p = FIELD.lineLF / Math.SQRT2; // foul-pole x/y magnitude
  const c = FIELD.centerCF;
  const cy = (2 * p * p - c * c) / (2 * (p - c));
  const r = c - cy;
  const aLeft = Math.atan2(LEFT_FOUL_POLE[1] - cy, LEFT_FOUL_POLE[0]);
  const aRight = Math.atan2(RIGHT_FOUL_POLE[1] - cy, RIGHT_FOUL_POLE[0]);
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = aLeft + ((aRight - aLeft) * i) / steps;
    pts.push([r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts; // left pole -> center -> right pole
}

// Closed fair-territory outline: home -> RF line -> wall -> LF line -> home.
export function fairTerritoryPoints(): [number, number][] {
  const wallRightToLeft = [...outfieldWallPoints()].reverse();
  return [BASES.home, ...wallRightToLeft, BASES.home];
}

export const INFIELD_DIAMOND: [number, number][] = [
  BASES.home,
  BASES.first,
  BASES.second,
  BASES.third,
];

export const FOUL_LINES: [[number, number], [number, number]][] = [
  [BASES.home, RIGHT_FOUL_POLE],
  [BASES.home, LEFT_FOUL_POLE],
];

// Build an SVG path string from feet points using the supplied projector.
export function toPath(
  points: [number, number][],
  project: Project,
  close = false,
): string {
  const d = points
    .map(([x, y], i) => {
      const [px, py] = project(x, y);
      return `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(" ");
  return close ? `${d} Z` : d;
}
