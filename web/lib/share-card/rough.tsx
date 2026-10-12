import rough from "roughjs";
import { C, INK_FAINT } from "./tokens";

// Hand-drawn ink for the share cards, from the same rough.js the site draws its
// ScorecardFrame with. rough.generator() needs no DOM: it returns path data that
// Satori renders as plain SVG. A fixed seed per card keeps the wobble identical
// every time the image is rebuilt.

const gen = rough.generator();

export type InkPath = { d: string; stroke: string; strokeWidth: number; fill: string };

type Pen = {
  stroke: string;
  strokeWidth: number;
  roughness: number;
  seed: number;
  bowing?: number;
  fill?: string;
};

const ink = (drawable: ReturnType<typeof gen.rectangle>): InkPath[] =>
  gen.toPaths(drawable).map((p) => ({ d: p.d, stroke: p.stroke, strokeWidth: p.strokeWidth, fill: p.fill ?? "none" }));

export const roughRect = (x: number, y: number, w: number, h: number, pen: Pen): InkPath[] =>
  ink(gen.rectangle(x, y, w, h, { ...pen, fillStyle: pen.fill ? "solid" : undefined }));

export const roughLine = (x1: number, y1: number, x2: number, y2: number, pen: Pen): InkPath[] =>
  ink(gen.line(x1, y1, x2, y2, pen));

/** Same string hash as ScorecardFrame's seedFromString, so a slug always draws the same frame. */
export function seedFrom(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 100000;
}

/**
 * ScorecardFrame's double-line frame (navy outer + faint inner rule, same
 * roughness), with strokes scaled by `k`: a share image is shown at ~40% size
 * in a phone feed, where the site's 2.5px line would vanish.
 */
export function scorecardFrame(w: number, h: number, seed: number, k: number): InkPath[] {
  const inset = 5 * k;
  const inset2 = inset + 4 * k;
  return [
    ...roughRect(inset, inset, w - 2 * inset, h - 2 * inset, { stroke: C.navy, strokeWidth: 2.5 * k, roughness: 1.4, seed }),
    ...roughRect(inset2, inset2, w - 2 * inset2, h - 2 * inset2, {
      stroke: INK_FAINT,
      strokeWidth: 1 * k,
      roughness: 2,
      seed: seed + 1,
    }),
  ];
}

/** An absolutely positioned SVG layer of ink paths covering its (relative) parent. */
export function Ink({ paths, width, height }: { paths: InkPath[]; width: number; height: number }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", left: 0, top: 0 }}
    >
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          stroke={p.stroke}
          strokeWidth={p.strokeWidth}
          fill={p.fill}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
