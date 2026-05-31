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
export type Point = [number, number];

export const FIELD = {
  // Visible drawing frame in feet (also fixes the chart aspect ratio).
  xMin: -260,
  xMax: 260,
  yMin: -75,
  yMax: 420,
  // Symmetric Rogers Centre dimensions: foul lines 328', power alleys 375',
  // center field 400'.
  lineLF: 328,
  alleyLF: 375,
  centerCF: 400,
  alleyRF: 375,
  lineRF: 328,
  baseDistance: 90,
  moundDistance: 60.5,
} as const;

export const FIELD_WIDTH_FT = FIELD.xMax - FIELD.xMin;
export const FIELD_HEIGHT_FT = FIELD.yMax - FIELD.yMin;

const DEG = Math.PI / 180;

// Azimuth measured from +y (dead center), positive toward right field.
export function polar(thetaDeg: number, dist: number): Point {
  const t = thetaDeg * DEG;
  return [dist * Math.sin(t), dist * Math.cos(t)];
}

export const LEFT_FOUL_POLE = polar(-45, FIELD.lineLF);
export const RIGHT_FOUL_POLE = polar(45, FIELD.lineRF);

export const BASES = {
  home: [0, 0] as Point,
  first: polar(45, FIELD.baseDistance),
  second: polar(0, FIELD.baseDistance * Math.SQRT2),
  third: polar(-45, FIELD.baseDistance),
};

export const MOUND = polar(0, FIELD.moundDistance);

// Infield dirt: a circle centered midway between home plate and second base.
export const DIRT_CENTER: Point = [0, (FIELD.baseDistance * Math.SQRT2) / 2];
export const DIRT_RADIUS = 95;

// The infield dirt is the INTERSECTION of the dirt circle (center DIRT_CENTER,
// radius DIRT_RADIUS) with the fair-territory wedge (y >= 0 and within the ±45°
// foul lines). Its boundary is three segments walked as one loop:
//   A) the circle arc that lies inside the wedge — from the right foul-line
//      crossing, counter-clockwise over the top, to the left foul-line crossing;
//   B) the LEFT foul line, from that left crossing straight down to home (0,0);
//   C) the RIGHT foul line, from home back up to the right crossing (closing).
// Circle vs. a foul line (x = ±y): substitute into x^2 + (y - cy)^2 = r^2:
//   2y^2 - 2*cy*y + (cy^2 - r^2) = 0  ->  y = (cy + sqrt(2 r^2 - cy^2)) / 2.
// (B/C run left->home->right, not right->home->left, because the CCW arc ends on
// the left side; reversing them would self-intersect the polygon.)
export function infieldDirtPoints(sides = 72): Point[] {
  void sides; // signature kept for compatibility; the arc uses a fixed step count
  const [cx, cy] = DIRT_CENTER;
  const r = DIRT_RADIUS;

  // Foul-line intersections (positive root; x = ±y on the ±45° lines).
  const y = (cy + Math.sqrt(2 * r * r - cy * cy)) / 2;
  const rightIntersect: Point = [y, y];
  const leftIntersect: Point = [-y, y];

  // Segment A: arc inside the wedge, right -> over the top -> left (CCW).
  const aRight = Math.atan2(rightIntersect[1] - cy, rightIntersect[0] - cx);
  const aLeft = Math.atan2(leftIntersect[1] - cy, leftIntersect[0] - cx);
  const steps = 60;
  const arcPoints: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = aRight + ((aLeft - aRight) * i) / steps;
    arcPoints.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }

  // Segment B: left foul line, leftIntersect -> home.
  // Segment C: right foul line, home -> rightIntersect.
  const segmentB: Point[] = [leftIntersect, [0, 0]];
  const segmentC: Point[] = [[0, 0], rightIntersect];

  const polygon: Point[] = [...arcPoints, ...segmentB, ...segmentC];
  polygon.push(arcPoints[0]); // close back to the arc start (rightIntersect)
  return polygon;
}

// Uniform Catmull-Rom: smooth curve passing through every control point.
function catmullRom(points: Point[], perSeg = 16): Point[] {
  const n = points.length;
  if (n < 3) return points;
  const padded = [points[0], ...points, points[n - 1]];
  const out: Point[] = [];
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = padded[i];
    const [x1, y1] = padded[i + 1];
    const [x2, y2] = padded[i + 2];
    const [x3, y3] = padded[i + 3];
    for (let j = 0; j < perSeg; j++) {
      const t = j / perSeg;
      const t2 = t * t;
      const t3 = t2 * t;
      const x =
        0.5 *
        (2 * x1 +
          (-x0 + x2) * t +
          (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 +
          (-x0 + 3 * x1 - 3 * x2 + x3) * t3);
      const y =
        0.5 *
        (2 * y1 +
          (-y0 + y2) * t +
          (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 +
          (-y0 + 3 * y1 - 3 * y2 + y3) * t3);
      out.push([x, y]);
    }
  }
  out.push(points[n - 1]);
  return out;
}

// Outfield wall: smooth curve through the five official control points.
const WALL_CONTROL: Point[] = [
  LEFT_FOUL_POLE,
  polar(-22.5, FIELD.alleyLF),
  polar(0, FIELD.centerCF),
  polar(22.5, FIELD.alleyRF),
  RIGHT_FOUL_POLE,
];

export function outfieldWallPoints(): Point[] {
  return catmullRom(WALL_CONTROL, 20); // LF pole -> center -> RF pole
}

// Closed fair-territory outline: home -> RF line -> wall -> LF line -> home.
export function fairTerritoryPoints(): Point[] {
  return [BASES.home, ...outfieldWallPoints(), BASES.home];
}

// Scale a point radially toward home plate by `insetFt` feet.
function radialInset(p: Point, insetFt: number): Point {
  const dist = Math.hypot(p[0], p[1]);
  if (dist === 0) return p;
  const scale = (dist - insetFt) / dist;
  return [p[0] * scale, p[1] * scale];
}

export const WARNING_TRACK_WIDTH = 15;

// Warning-track ring: outer edge = outfield wall (LF->RF), inner edge = the
// same wall inset toward home, traversed back (RF->LF), closed into a ring.
export function warningTrackPoints(): Point[] {
  const outer = outfieldWallPoints(); // LF pole -> RF pole
  const innerControl = WALL_CONTROL.map((p) =>
    radialInset(p, WARNING_TRACK_WIDTH),
  );
  const inner = catmullRom(innerControl, 20); // inset LF pole -> inset RF pole
  return [...outer, ...inner.reverse()]; // outer forward + inner backward
}

// Foul-ground outer boundary (warning-track edge of foul territory), in feet.
// Endpoints stay at the foul poles so the region aligns with FOUL_LINES and the
// fair wedge. Reading top-down: LF pole -> third-base side -> backstop behind
// home -> first-base side -> RF pole. Backstop is ~72 ft deep and ~90 ft wide
// on each side, per the Rogers Centre footprint.
const FOUL_OUTER_CONTROL: Point[] = [
  LEFT_FOUL_POLE, //  LF foul pole: LF line meets the wall (328 ft down the line)
  [-190, 150], //     upper third-base line: gentle outward bulge from the foul line
  [-130, 70], //      foul ground beyond third base, widening toward the infield corner
  [-90, -10], //      left edge of the backstop arc (~90 ft left of home plate)
  [-55, -58], //      backstop curving in behind home (third-base side)
  [0, -72], //        deepest point of the backstop (~72 ft directly behind home)
  [55, -58], //       backstop curving in behind home (first-base side)
  [90, -10], //       right edge of the backstop arc (~90 ft right of home plate)
  [130, 70], //       foul ground beyond first base, widening toward the infield corner
  [190, 150], //      upper first-base line: gentle outward bulge from the foul line
  RIGHT_FOUL_POLE, // RF foul pole: RF line meets the wall (328 ft down the line)
];

// Closed foul-territory region: home -> LF line -> outer boundary -> RF line.
export function foulGroundPoints(): Point[] {
  return [BASES.home, ...catmullRom(FOUL_OUTER_CONTROL, 14), BASES.home];
}

export const INFIELD_DIAMOND: Point[] = [
  BASES.home,
  BASES.first,
  BASES.second,
  BASES.third,
];

export const FOUL_LINES: [Point, Point][] = [
  [BASES.home, RIGHT_FOUL_POLE],
  [BASES.home, LEFT_FOUL_POLE],
];

// Push a point radially outward from home by `dist` feet (for label placement).
function outward([x, y]: Point, dist: number): Point {
  const m = Math.hypot(x, y) || 1;
  return [x + (x / m) * dist, y + (y / m) * dist];
}

export const DISTANCE_MARKERS: {
  at: Point;
  label: number;
  anchor: "start" | "middle" | "end";
}[] = [
  { at: outward(LEFT_FOUL_POLE, 14), label: FIELD.lineLF, anchor: "end" },
  { at: outward(polar(-22.5, FIELD.alleyLF), 14), label: FIELD.alleyLF, anchor: "end" },
  { at: outward(polar(0, FIELD.centerCF), 12), label: FIELD.centerCF, anchor: "middle" },
  { at: outward(polar(22.5, FIELD.alleyRF), 14), label: FIELD.alleyRF, anchor: "start" },
  { at: outward(RIGHT_FOUL_POLE, 14), label: FIELD.lineRF, anchor: "start" },
];

// Build an SVG path string from feet points using the supplied projector.
export function toPath(points: Point[], project: Project, close = false): string {
  const d = points
    .map(([x, y], i) => {
      const [px, py] = project(x, y);
      return `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(" ");
  return close ? `${d} Z` : d;
}
