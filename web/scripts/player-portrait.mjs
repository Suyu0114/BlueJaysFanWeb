// Draws a player's portrait from a short feature file, in a loose hand-drawn ink style: brush lines
// that swell, taper, break and overshoot, over flat colour patches laid a little off the lines, the
// skin mostly paper with its shadows blocked in, stubble and beards as short pen strokes.
//
// Usage (from web/):  node scripts/player-portrait.mjs <mlbam_id> [<mlbam_id> ...] [--png <dir>]
//
// Reads  content/portraits/<id>.json  (the features: written by the /player-portrait skill after
//                                       looking at the player's headshot; see FEATURES below)
// Writes content/portraits/<id>.svg   (400 x 400, transparent outside the roundel), which the
//                                       share cards embed for a fact with "player": <id>
// and with --png, <dir>/<id>.png (600 px) to check it. sharp comes through next, so no new package.
//
// One head for everyone, so the portraits read as one illustrated series: the features move, the
// hand never does. Nothing is traced from a photo. The cap stays plain: no logo (the author's call,
// 2026-10-22; the club's bird and maple leaf are trademarks anyway, see the logo rules in CLAUDE.md).

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import rough from "roughjs";

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve("next/package.json"))("sharp");

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(WEB, "content", "portraits");

// Keep in sync with the @theme block in app/globals.css (as lib/share-card/tokens.ts does).
const NAVY = "#003049";
const PAPAYA = "#fdf0d5";
const STEEL = "#669bbc";
const LAVA = "#780000";
const DIRT = "#dab681";

/** color-mix(in srgb, a p, b), as lib/share-card/tokens.ts mix(). */
function mix(a, b, p) {
  const ch = (h, i) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) * p + ch(b, i) * (1 - p)).toString(16).padStart(2, "0")).join("")}`;
}

// The palette: ink, paper and token mixes. Skin is a base wash plus a shadow (and, on darker skin, a
// highlight), so the face stays readable without outlining every plane.
const INK = NAVY;
const SKIN = {
  fair: mix(PAPAYA, DIRT, 0.6),
  light: mix(mix(DIRT, LAVA, 0.86), PAPAYA, 0.55),
  tan: mix(DIRT, LAVA, 0.86),
  brown: mix(mix(DIRT, LAVA, 0.55), NAVY, 0.78),
  deep: mix(mix(DIRT, LAVA, 0.45), NAVY, 0.72),
};
const LIGHT_SKIN = new Set(["fair", "light"]);
const HAIR = { black: mix(NAVY, LAVA, 0.72), brown: mix(mix(LAVA, DIRT, 0.5), NAVY, 0.6), blond: mix(DIRT, LAVA, 0.9), gray: mix(PAPAYA, NAVY, 0.55) };
const BG = mix(STEEL, PAPAYA, 0.32);
const CAP = mix(NAVY, STEEL, 0.5);
const CAP_DARK = mix(NAVY, STEEL, 0.8);
const SHIRT_SHADE = mix(STEEL, PAPAYA, 0.42);
const MOUTH = mix(LAVA, NAVY, 0.7);
const GOLD = mix(DIRT, LAVA, 0.85);

/**
 * The features (content/portraits/<id>.json). Every number is a factor around 1 = the average head:
 * exaggerate what makes the player recognisable (that's the caricature) and leave the rest at 1.
 */
const FEATURES = {
  name: "",
  skin: "tan", // fair | light | tan | brown | deep
  hair: "black", // black | brown | blond | gray: brows, sideburns, beard
  face: { width: 1, jaw: 1, length: 1 }, // width: cheeks; jaw: jaw width vs cheeks; length: brim to chin
  ears: 1,
  eyes: { size: 1, spacing: 1, smile: 0.5 }, // smile 0..1 narrows the eyes and lifts the cheeks
  brows: { weight: 1, arch: 0.3, tilt: 0 }, // tilt > 0 lifts the outer ends
  nose: { width: 1, length: 1 },
  mouth: { width: 1, open: 0.8, teeth: true }, // open 0 = a closed smile line
  beard: { style: "none", length: 1 }, // none | stubble | goatee | full
  neck: 1,
  chain: "none", // none | thin | thick
};

// ---- noise and geometry ----------------------------------------------------------------------

let rand = Math.random;
/** Deterministic noise (mulberry32), reseeded per player so a portrait redraws identically. */
function prng(s) {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (a, b) => a + rand() * (b - a);
/** Smooth 1-D noise in about [-1, 1]: three sines with random phases, `scale` px per wiggle. */
function wave(scale) {
  const p = [between(0, 6.3), between(0, 6.3), between(0, 6.3)];
  return (s) => (Math.sin(s / scale + p[0]) + 0.5 * Math.sin(s / (scale * 0.43) + p[1]) + 0.25 * Math.sin(s / (scale * 0.19) + p[2])) / 1.75;
}

/** Absolute SVG path (M L H V C Q Z) -> polylines [[x, y], ...], curves flattened. */
function parse(d) {
  const tok = d.match(/[MLHVCQZ]|-?\d*\.?\d+(?:e-?\d+)?/gi);
  const out = [];
  let cur = null;
  let x = 0;
  let y = 0;
  let i = 0;
  const num = () => +tok[i++];
  let cmd = "M";
  while (i < tok.length) {
    if (/[A-Z]/i.test(tok[i])) cmd = tok[i++].toUpperCase();
    if (cmd === "Z") {
      if (cur && cur.length) cur.push([...cur[0]]);
      continue;
    }
    if (cmd === "M") {
      x = num();
      y = num();
      cur = [[x, y]];
      out.push(cur);
      cmd = "L";
    } else if (cmd === "L") {
      x = num();
      y = num();
      cur.push([x, y]);
    } else if (cmd === "H") {
      x = num();
      cur.push([x, y]);
    } else if (cmd === "V") {
      y = num();
      cur.push([x, y]);
    } else if (cmd === "C") {
      const [x1, y1, x2, y2, x3, y3] = [num(), num(), num(), num(), num(), num()];
      for (let k = 1; k <= 24; k++) {
        const t = k / 24;
        const u = 1 - t;
        cur.push([u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3]);
      }
      x = x3;
      y = y3;
    } else if (cmd === "Q") {
      const [x1, y1, x2, y2] = [num(), num(), num(), num()];
      for (let k = 1; k <= 18; k++) {
        const t = k / 18;
        const u = 1 - t;
        cur.push([u * u * x + 2 * u * t * x1 + t * t * x2, u * u * y + 2 * u * t * y1 + t * t * y2]);
      }
      x = x2;
      y = y2;
    }
  }
  return out;
}
const line = (d) => parse(d)[0];
function ellipsePts(cx, cy, rx, ry, from = 0, to = Math.PI * 2, n = 48) {
  return Array.from({ length: n + 1 }, (_, k) => {
    const a = from + ((to - from) * k) / n;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
}
/** Even spacing along a polyline. */
function resample(pts, step = 1.5) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    let s = step - carry;
    while (s <= len) {
      out.push([ax + ((bx - ax) * s) / len, ay + ((by - ay) * s) / len]);
      s += step;
    }
    carry = len - (s - step);
  }
  const last = pts[pts.length - 1];
  if (Math.hypot(last[0] - out[out.length - 1][0], last[1] - out[out.length - 1][1]) > 0.3) out.push(last);
  return out;
}
function normals(pts) {
  return pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  });
}
function inside([x, y], poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const f1 = (n) => n.toFixed(1);
const polyPath = (pts) => `M${pts.map(([x, y]) => `${f1(x)},${f1(y)}`).join("L")}Z`;

// ---- the hand --------------------------------------------------------------------------------

/**
 * One brush line along `pts`, as a filled shape: it starts with pressure, swells and thins with a
 * slow wobble, and flicks off thin at the end. `over` lets the pen run past its ends, `brk` breaks a
 * long line into strokes, `dbl` adds a lighter second pass beside part of it, like a sketch line.
 */
function brush(pts, o = {}) {
  const { w = 3, wob = 0.7, over = 2.5, brk = 0, dbl = 0, color = INK, op = 1, head = 0.1, tail = 0.35 } = o;
  let p = resample(pts);
  const len = p.length * 1.5;
  if (brk && len > brk) {
    const cuts = Math.min(3, Math.floor(len / brk));
    const out = [];
    let start = 0;
    for (let c = 1; c <= cuts; c++) {
      const end = Math.floor((p.length * c) / (cuts + 1) + between(-4, 4));
      out.push(brush(p.slice(start, Math.max(start + 3, end)), { ...o, brk: 0 }));
      start = end + Math.round(between(1, 4));
    }
    out.push(brush(p.slice(start), { ...o, brk: 0 }));
    return out.join("");
  }
  if (p.length < 2) return "";
  const ext = (a, b, k) => [a[0] + ((a[0] - b[0]) / (Math.hypot(a[0] - b[0], a[1] - b[1]) || 1)) * k, a[1] + ((a[1] - b[1]) / (Math.hypot(a[0] - b[0], a[1] - b[1]) || 1)) * k];
  p = [ext(p[0], p[1], between(0, over)), ...p, ext(p[p.length - 1], p[p.length - 2], between(0, over * 1.6))];
  p = resample(p);
  const n = normals(p);
  const wobble = wave(between(14, 26));
  const press = wave(between(10, 20));
  const L = p.length - 1;
  const width = (i) => {
    const t = i / L;
    const taper = Math.min(1, (t / head) ** 0.5, ((1 - t) / tail) ** 0.8);
    return Math.max(0.18, w * Math.max(0.12, taper) * (0.82 + 0.3 * press(i * 1.5)));
  };
  const c = p.map(([x, y], i) => [x + n[i][0] * wob * wobble(i * 1.5), y + n[i][1] * wob * wobble(i * 1.5)]);
  const left = c.map(([x, y], i) => [x + (n[i][0] * width(i)) / 2, y + (n[i][1] * width(i)) / 2]);
  const right = c.map(([x, y], i) => [x - (n[i][0] * width(i)) / 2, y - (n[i][1] * width(i)) / 2]).reverse();
  let svg = `<path d="${polyPath([...left, ...right])}" fill="${color}"${op < 1 ? ` opacity="${op}"` : ""}/>`;
  if (dbl && rand() < dbl && p.length > 12) {
    const a = Math.floor(between(0, 0.3) * p.length);
    const b = Math.floor(between(0.55, 1) * p.length);
    const side = rand() < 0.5 ? -1 : 1;
    const off = between(1.2, 2.4) * side;
    svg += brush(
      c.slice(a, b).map(([x, y], i) => [x + n[a + i][0] * off, y + n[a + i][1] * off]),
      { w: w * 0.45, wob, over: 1, color, op: 0.7 },
    );
  }
  return svg;
}

/** A flat colour patch: the shape with a slow ragged edge, nudged off the line art like a loose wash. */
function wash(pts, color, o = {}) {
  const { dx = 3.5, dy = 2.5, amp = 2.2, op = 1 } = o;
  const p = resample(pts, 2);
  const n = normals(p);
  const edge = wave(between(8, 16));
  const q = p.map(([x, y], i) => [x + dx + n[i][0] * amp * edge(i * 2), y + dy + n[i][1] * amp * edge(i * 2)]);
  return `<path d="${polyPath(q)}" fill="${color}"${op < 1 ? ` opacity="${op}"` : ""}/>`;
}

/** Short pen strokes scattered inside `poly` and outside `skip` (stubble, beard, sideburns): `dir(x, y)` = their angle. */
function hatch(poly, { step = 6, len = 6, w = 1.3, dir = () => Math.PI / 2, keep = 1, color = INK, op = 1, skip = null } = {}) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const out = [];
  for (let gy = Math.min(...ys); gy < Math.max(...ys); gy += step)
    for (let gx = Math.min(...xs); gx < Math.max(...xs); gx += step) {
      const x = gx + between(-step, step) * 0.45;
      const y = gy + between(-step, step) * 0.45;
      if (!inside([x, y], poly) || (skip && inside([x, y], skip)) || rand() > keep) continue;
      const a = dir(x, y) + between(-0.25, 0.25);
      const l = len * between(0.7, 1.25);
      const dx = (Math.cos(a) * l) / 2;
      const dy = (Math.sin(a) * l) / 2;
      out.push(brush([[x - dx, y - dy], [x + dx, y + dy]], { w: w * between(0.8, 1.2), wob: 0.3, over: 0.5, head: 0.2, tail: 0.6, color, op }));
    }
  return out.join("");
}

// ---- the head --------------------------------------------------------------------------------

const merge = (base, over) =>
  Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v && typeof v === "object" ? { ...v, ...(over?.[k] ?? {}) } : (over?.[k] ?? v)]));

function draw(f, id) {
  rand = prng(id);
  const cx = 200;
  const light = LIGHT_SKIN.has(f.skin);
  const skinTone = SKIN[f.skin] ?? SKIN.tan;
  const base = light ? mix(skinTone, PAPAYA, 0.45) : skinTone;
  const shadow = light ? mix(skinTone, LAVA, 0.86) : mix(skinTone, NAVY, 0.7);
  const glow = mix(skinTone, PAPAYA, 0.5);
  const hair = HAIR[f.hair] ?? HAIR.black;
  const W = 82 * f.face.width;
  const J = 68 * f.face.width * f.face.jaw;
  const top = 160;
  const y = (v) => top + (v - top) * f.face.length;
  const chinY = y(330);
  const N = 36 * f.neck;
  const es = 32 * f.eyes.spacing;
  const mW = 28 * f.mouth.width;
  const my = y(294);
  const cW = W + 14;
  // Layers, back to front: washes, the ink under the features (body, face, beard), the features
  // (mouth, eyes, brows), then the cap, which sits in front of everything it overlaps.
  const washes = [];
  const lines = [];
  const front = [];
  const capLayer = [];

  // ---- shapes (centre lines and outlines, in the head's own coordinates) ----
  const faceL = `M${cx - W},${top} C${cx - W - 3},${y(210)} ${cx - W + 1},${y(262)} ${cx - J},${y(292)} C${cx - J + 8},${y(318)} ${cx - 28},${chinY} ${cx},${chinY}`;
  const faceR = `M${cx + W},${top} C${cx + W + 3},${y(210)} ${cx + W - 1},${y(262)} ${cx + J},${y(292)} C${cx + J - 8},${y(318)} ${cx + 28},${chinY} ${cx},${chinY}`;
  const facePoly = [...line(faceL), ...line(faceR).reverse()];
  const neck = [[cx - N, y(270)], [cx - N - 8, 430], [cx + N + 8, 430], [cx + N, y(270)]];
  const vY = chinY + 64;
  const collarL = [cx - N - 20, chinY + 16];
  const collarR = [cx + N + 20, chinY + 16];
  const shoulders = line(`M-10,${chinY + 34} C40,${chinY + 22} 96,${chinY + 18} ${collarL[0]},${collarL[1]}`);
  const shouldersR = line(`M410,${chinY + 34} C360,${chinY + 22} 304,${chinY + 18} ${collarR[0]},${collarR[1]}`);
  const jersey = [[-10, 430], ...shoulders, [cx, vY], ...shouldersR.slice().reverse(), [410, 430]];
  const crown = line(`M${cx - cW + 2},202 C${cx - cW - 6},140 ${cx - 86},106 ${cx},104 C${cx + 86},106 ${cx + cW + 6},140 ${cx + cW - 2},202`);
  const billTop = line(`M${cx - cW - 20},200 Q${cx},136 ${cx + cW + 20},200`);
  const billBottom = line(`M${cx - cW - 18},214 Q${cx},172 ${cx + cW + 18},214`);
  const ears = [-1, 1].map((s) => ({ s, x: cx + s * (W - 2), y: y(238), rx: 14 * f.ears, ry: 24 * f.ears }));

  // ---- washes: neck, jersey, ears, face, shadows, beard ----
  washes.push(wash(neck, base, { amp: 2, dx: 5, dy: 3.5 }));
  washes.push(wash([[cx - N - 4, chinY - 10], [cx + N + 4, chinY - 10], [cx + N + 6, chinY + 26], [cx + 6, chinY + 34], [cx - N - 2, chinY + 20]], shadow, { amp: 3 }));
  washes.push(wash(jersey, PAPAYA, { dx: 2, dy: 1, amp: 1 }));
  washes.push(wash([[cx + 40, chinY + 30], [330, chinY + 30], [400, chinY + 50], [400, 430], [cx + 70, 430], [cx + 30, vY + 10]], SHIRT_SHADE, { amp: 4 }));
  washes.push(wash([[cx - N - 20, chinY + 20], [cx - 4, vY + 4], [cx - 10, vY + 26], [cx - N - 34, chinY + 30]], SHIRT_SHADE, { amp: 2, op: 0.8 }));
  for (const e of ears) {
    washes.push(wash(ellipsePts(e.x, e.y, e.rx, e.ry), base, { amp: 1.5, dx: 5, dy: 3.5 }));
    washes.push(wash(ellipsePts(e.x - e.s * 2, e.y + 2, e.rx * 0.5, e.ry * 0.6), shadow, { amp: 1, op: 0.85 }));
  }
  washes.push(wash(facePoly, base, { amp: 2.5, dx: 5, dy: 3.5 }));
  // light from the upper left: the right side, under the cap, under the nose and lip go into shadow
  washes.push(
    wash(
      [...line(`M${cx + W * 0.62},${top + 30} C${cx + W * 0.5},${y(240)} ${cx + W * 0.66},${y(276)} ${cx + J * 0.5},${y(312)} L${cx + 6},${chinY + 4}`), ...line(faceR).reverse().slice(0, -2)],
      shadow,
      { amp: 2.5 },
    ),
  );
  washes.push(wash(line(`M${cx - cW},214 Q${cx},180 ${cx + cW},214 L${cx + cW},232 Q${cx},204 ${cx - cW},232Z`), shadow, { amp: 1.5, op: 0.9 }));
  if (!light) washes.push(wash(line(`M${cx - 3},${y(240)} Q${cx - 6},${y(252)} ${cx - 4},${y(262)}`).concat([[cx - 1, y(262)], [cx, y(240)]]), glow, { amp: 0.6, op: 0.45 }));
  const nW = 15 * f.nose.width;
  const ny = y(270);
  washes.push(wash([[cx + 3, ny - 26], [cx + nW, ny - 4], [cx + nW - 2, ny + 8], [cx - nW * 0.6, ny + 10], [cx - nW * 0.2, ny + 4]], shadow, { amp: 1.5 }));

  // beard
  const beardStyle = f.beard.style;
  let beardPoly = null;
  if (beardStyle !== "none") {
    const bl = (beardStyle === "full" ? 26 : beardStyle === "goatee" ? 10 : 5) * f.beard.length;
    const cheek = beardStyle === "full" ? y(258) : y(272);
    const tache = ` C${cx + mW * 0.6},${y(280)} ${cx + 14},${y(281)} ${cx},${y(283)} C${cx - 14},${y(281)} ${cx - mW * 0.6},${y(280)} ${cx - mW - 12},${y(288)}`;
    const d =
      beardStyle === "goatee"
        ? `M${cx - mW - 10},${y(288)} C${cx - mW - 14},${y(318)} ${cx - 26},${chinY + bl} ${cx},${chinY + bl} C${cx + 26},${chinY + bl} ${cx + mW + 14},${y(318)} ${cx + mW + 12},${y(288)}${tache}Z`
        : `M${cx - W + 1},200 C${cx - W - 2},${y(232)} ${cx - W + 1},${y(266)} ${cx - J - 2},${y(294)} ` +
          `C${cx - J + 6},${y(326) + bl * 0.6} ${cx - 30},${chinY + bl} ${cx},${chinY + bl} ` +
          `C${cx + 30},${chinY + bl} ${cx + J - 6},${y(326) + bl * 0.6} ${cx + J + 2},${y(294)} ` +
          `C${cx + W - 1},${y(266)} ${cx + W + 2},${y(232)} ${cx + W - 1},200 L${cx + W - 12},200 ` +
          `C${cx + W - 14},${y(226)} ${cx + W * 0.6},${cheek} ${cx + mW + 12},${y(288)}${tache} ` +
          `C${cx - W * 0.6},${cheek} ${cx - W + 14},${y(226)} ${cx - W + 12},200Z`;
    beardPoly = parse(d)[0];
    if (beardStyle === "full") {
      washes.push(wash(beardPoly, mix(hair, skinTone, 0.75), { amp: 3.5, dx: 2, dy: 3 }));
    } else if (!light) {
      washes.push(wash(beardPoly, mix(skinTone, hair, 0.85), { amp: 2, op: 0.8 }));
    }
  }

  // cap: crown, a darker right side, the bill and its underside (its own layer, in front)
  capLayer.push(wash([...crown, [cx + cW - 2, 202], [cx - cW + 2, 202]], CAP, { amp: 2 }));
  capLayer.push(wash([...line(`M${cx + 20},106 C${cx + 70},112 ${cx + cW + 4},146 ${cx + cW - 2},202`), [cx + cW - 30, 196], [cx + 34, 150]], CAP_DARK, { amp: 3, op: 0.85 }));
  capLayer.push(wash([...billBottom, ...line(`M${cx + cW + 14},222 Q${cx},186 ${cx - cW - 14},222`)], mix(NAVY, LAVA, 0.85), { amp: 1, dx: 1, dy: 1 }));
  capLayer.push(wash([...billTop, ...billBottom.slice().reverse()], CAP_DARK, { amp: 1.5, dx: 2.5, dy: 2 }));

  // ---- ink ----
  // jersey and neck
  lines.push(brush(shoulders, { w: 3.4, brk: 70, dbl: 0.4 }));
  lines.push(brush(shouldersR, { w: 3.4, brk: 70, dbl: 0.4 }));
  lines.push(brush([collarL, [cx, vY]], { w: 3 }) + brush([[cx, vY], collarR], { w: 3 }));
  lines.push(brush([[collarL[0] + 7, collarL[1] - 3], [cx, vY - 9], [collarR[0] - 7, collarR[1] - 3]], { w: 1.8, op: 0.8 }));
  washes.push(wash([collarL, [cx, vY], collarR, [collarR[0] - 8, collarR[1] - 4], [cx, vY - 10], [collarL[0] + 8, collarL[1] - 4]], STEEL, { amp: 0.8, dx: 1.5, dy: 1.5 }));
  lines.push(brush([[cx + 1, vY + 4], [cx - 1, 430]], { w: 2.2, brk: 40 }));
  // the neck's sides start where they leave the jaw
  for (const s of [-1, 1]) {
    const x = cx + s * N;
    const lower = line(s === -1 ? faceL : faceR).filter(([, py]) => py > y(280));
    const hit = lower.find(([px]) => (s === -1 ? px >= x : px <= x));
    const y0 = (hit ? hit[1] : chinY) + 2;
    lines.push(brush([[x, y0], [x + s * 4, chinY + 18]], { w: 2.8, over: 0.5 }));
  }
  if (f.chain !== "none") {
    const chain = resample(line(`M${cx - N * 0.85},${chinY + 6} Q${cx},${vY + 12} ${cx + N * 0.85},${chinY + 6}`), f.chain === "thick" ? 6 : 4.5);
    const r = f.chain === "thick" ? 2.6 : 1.8;
    for (const [x, yy] of chain) lines.push(`<ellipse cx="${f1(x)}" cy="${f1(yy)}" rx="${r}" ry="${r * 0.8}" fill="${GOLD}" stroke="${INK}" stroke-width="0.9"/>`);
  }
  // ears
  for (const e of ears) {
    const a0 = e.s < 0 ? Math.PI * 0.55 : -Math.PI * 0.45;
    lines.push(brush(ellipsePts(e.x, e.y, e.rx, e.ry, a0, a0 + Math.PI * 1.05, 30), { w: 3 }));
    lines.push(brush(line(`M${e.x - e.s * 3},${e.y - 10} Q${e.x + e.s * 6},${e.y - 2} ${e.x - e.s * 1},${e.y + 10}`), { w: 1.8 }));
  }
  // face outline: two strokes, the lit side lighter
  lines.push(brush(line(faceL), { w: 3, brk: 90, dbl: 0.5 }));
  lines.push(brush(line(faceR), { w: 4, brk: 90, dbl: 0.5 }));

  // beard and sideburns: pen strokes
  for (const s of [-1, 1]) {
    const x0 = cx + s * (W - 1);
    const burn = [[x0, 182], [x0 - s * 12, 182], [x0 - s * 11, y(228)], [x0 + s * 1, y(232)]];
    lines.push(hatch(burn, { step: 3.4, len: 9, w: 1.4, dir: () => Math.PI / 2, color: hair }));
  }
  // the mouth (computed here: the beard's strokes keep out of it)
  const mH = 26 * f.mouth.open;
  const gum = line(
    `M${cx - mW},${my - 3} C${cx - mW * 0.5},${my + 4} ${cx + mW * 0.5},${my + 4} ${cx + mW},${my - 3} ` +
      `C${cx + mW * 0.85},${my + mH * 0.9} ${cx + mW * 0.35},${my + mH} ${cx},${my + mH} C${cx - mW * 0.35},${my + mH} ${cx - mW * 0.85},${my + mH * 0.9} ${cx - mW},${my - 3}`,
  );
  const mouthZone = gum.map(([x, yy]) => [cx + (x - cx) * 1.12, my + (yy - my) * 1.25 - 1]);
  if (beardPoly) {
    const down = (x) => Math.PI / 2 - ((x - cx) / W) * 0.22;
    const strokes = (o) => hatch(beardPoly, { ...o, skip: mouthZone });
    if (beardStyle === "full") {
      lines.push(strokes({ step: 4.2, len: 10, w: 1.7, dir: down, color: hair }));
      lines.push(strokes({ step: 7, len: 8, w: 1.2, dir: (x) => down(x) + 0.45, color: INK, keep: 0.35 }));
    } else {
      lines.push(strokes({ step: 5.2, len: 5.5, w: 1.15, dir: down, color: hair, keep: 0.8 }));
    }
  }

  // nose: wings and the bridge's shadow side
  lines.push(brush(line(`M${cx - nW},${ny - 3} C${cx - nW - 5},${ny + 8} ${cx - nW * 0.4},${ny + 10} ${cx - 4},${ny + 6}`), { w: 2.6, head: 0.3 }));
  lines.push(brush(line(`M${cx + 5},${ny + 6} C${cx + nW * 0.4},${ny + 10} ${cx + nW + 5},${ny + 8} ${cx + nW},${ny - 3}`), { w: 3, tail: 0.5 }));
  lines.push(brush(line(`M${cx + 5},${ny - 24 * f.nose.length} Q${cx + 9},${ny - 12} ${cx + nW * 0.8},${ny - 6}`), { w: 2.2, head: 0.4 }));
  for (const s of [-1, 1]) lines.push(brush([[cx + s * nW * 0.62, ny + 2], [cx + s * nW * 0.3, ny + 4]], { w: 2.4, over: 0 }));

  // mouth: the grin's dark, the teeth left as paper, the lips as two lines and the corners
  if (f.mouth.open > 0.05) {
    front.push(wash(gum, MOUTH, { amp: 0.8, dx: 1, dy: 1 }));
    if (f.mouth.teeth) {
      const teeth = line(`M${cx - mW * 0.92},${my - 2} C${cx - mW * 0.4},${my + 5} ${cx + mW * 0.4},${my + 5} ${cx + mW * 0.92},${my - 2} C${cx + mW * 0.75},${my + mH * 0.8} ${cx - mW * 0.75},${my + mH * 0.8} ${cx - mW * 0.92},${my - 2}`);
      front.push(wash(teeth, PAPAYA, { amp: 0.5, dx: 0.5, dy: 0.5 }));
      for (const k of [-0.42, 0.05, 0.5]) front.push(brush([[cx + k * mW, my + 2], [cx + k * mW + 0.5, my + mH * 0.48]], { w: 1, op: 0.35, over: 0 }));
    }
    washes.push(wash(ellipsePts(cx + 4, my + mH + 9, mW * 0.55, 5, 0, 6.3, 24), shadow, { amp: 1.5, op: 0.9 }));
    front.push(brush(line(`M${cx - mW - 3},${my - 5} C${cx - mW * 0.5},${my + 5} ${cx + mW * 0.5},${my + 5} ${cx + mW + 3},${my - 5}`), { w: 3.4, dbl: 0.6 }));
    front.push(brush(line(`M${cx - mW * 0.8},${my + mH * 0.62} C${cx - mW * 0.4},${my + mH * 1.05} ${cx + mW * 0.4},${my + mH * 1.05} ${cx + mW * 0.85},${my + mH * 0.6}`), { w: 2.4, brk: 40 }));
  } else {
    front.push(brush(line(`M${cx - mW},${my - 2} C${cx - mW * 0.4},${my + 12} ${cx + mW * 0.4},${my + 12} ${cx + mW},${my - 2}`), { w: 3.2 }));
  }
  if (beardStyle !== "full") for (const s of [-1, 1]) lines.push(brush(line(`M${cx + s * (nW + 6)},${ny + 4} Q${cx + s * (mW + 14)},${my - 6} ${cx + s * (mW + 8)},${my + 8}`), { w: 2, op: 0.85 }));

  // eyes: paper whites, an iris, a heavy upper lid, a light lower lid; brows as one brush stroke
  const ey = y(234);
  const ew = 11 * f.eyes.size;
  const eh = 7.5 * f.eyes.size * (1 - 0.3 * f.eyes.smile);
  for (const s of [-1, 1]) {
    const ex = cx + s * es;
    front.push(wash(line(`M${ex - ew},${ey} Q${ex},${ey - eh * 2} ${ex + ew},${ey} Q${ex},${ey + eh * 1.3} ${ex - ew},${ey}`), PAPAYA, { amp: 0.4, dx: 0.5, dy: 0.5 }));
    front.push(`<ellipse cx="${f1(ex + s * 0.5)}" cy="${f1(ey - eh * 0.25)}" rx="${f1(ew * 0.42)}" ry="${f1(eh * 0.95)}" fill="${INK}"/>`);
    front.push(`<circle cx="${f1(ex + s * 0.5 + ew * 0.16)}" cy="${f1(ey - eh * 0.55)}" r="${f1(ew * 0.13)}" fill="${PAPAYA}"/>`);
    front.push(brush(line(`M${ex - s * (ew + 3)},${ey + 1} Q${ex},${ey - eh * 2.2} ${ex + s * (ew + 4)},${ey - 1}`), { w: 3.6, head: 0.15, tail: 0.5, over: 1.5 }));
    front.push(brush(line(`M${ex - ew + 2},${ey + 2} Q${ex},${ey + eh * 1.5} ${ex + ew - 1},${ey + 1}`), { w: 1.4, op: 0.8, over: 0.5 }));
    if (f.eyes.smile > 0.3) front.push(brush(line(`M${ex - ew - 2},${ey + eh + 7} Q${ex},${ey + eh + 3} ${ex + ew + 2},${ey + eh + 7}`), { w: 1.6, op: 0.75 }));
    const by = y(212);
    const t = 6.5 * f.brows.weight;
    const o = cx + s * (es + 24);
    const i = cx + s * 13;
    front.push(brush(line(`M${i},${by} Q${(i + o) / 2},${by - f.brows.arch * 10 - 3} ${o},${by + 5 - f.brows.tilt * 10}`), { w: t, head: 0.05, tail: 0.6, color: hair, over: 1 }));
    front.push(brush(line(`M${i + s * 2},${by - 1} Q${(i + o) / 2},${by - f.brows.arch * 10 - 6} ${o - s * 6},${by - f.brows.tilt * 10}`), { w: t * 0.4, color: INK, op: 0.6 }));
  }

  // cap: the outline, the front seam and eyelets, the bill's two edges and its stitching (no logo)
  capLayer.push(brush(crown, { w: 4, brk: 110, dbl: 0.5 }));
  capLayer.push(brush(line(`M${cx},108 Q${cx - 3},140 ${cx - 1},166`), { w: 1.6, op: 0.7 }));
  for (const s of [-1, 1]) capLayer.push(brush(ellipsePts(cx + s * cW * 0.62, 138, 3.4, 3.4, 0, 6.6, 16), { w: 1.4, over: 0 }));
  capLayer.push(brush(ellipsePts(cx, 104, 9, 4.5, 0, 6.6, 20), { w: 2, over: 0 }));
  capLayer.push(brush(billTop, { w: 4.2, brk: 120, dbl: 0.6 }));
  capLayer.push(brush(billBottom, { w: 3.2, brk: 120 }));
  const stitch = resample(line(`M${cx - cW - 8},204 Q${cx},150 ${cx + cW + 8},204`), 7);
  for (let k = 0; k + 1 < stitch.length; k += 2) capLayer.push(brush([stitch[k], stitch[k + 1]], { w: 1.4, over: 0, color: mix(STEEL, PAPAYA, 0.5), head: 0.3, tail: 0.3 }));

  // The roundel: a flat background, the figure (cropped tight on the face, which has to read at ~90 px
  // on an X card) clipped to the disc, then the ring: the site frames' rough.js double line, a heavy
  // ring and a faint inner one (the author kept this from the earlier cartoon version, 2026-10-22).
  const gen = rough.generator();
  const roughRing = (r, o) =>
    gen
      .toPaths(gen.circle(200, 200, 2 * r, { seed: id % 9973, ...o }))
      .map((p) => `<path d="${p.d}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`)
      .join("");
  const ring = roughRing(186, { stroke: NAVY, strokeWidth: 8, roughness: 1.1 }) + roughRing(177, { stroke: mix(NAVY, BG, 0.45), strokeWidth: 2.4, roughness: 1.5 });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">` +
    `<title>${f.name}</title><defs><clipPath id="disc${id}"><circle cx="200" cy="200" r="182"/></clipPath></defs>` +
    `<g clip-path="url(#disc${id})"><circle cx="200" cy="200" r="182" fill="${BG}"/>` +
    `<g transform="translate(-14,-74) scale(1.07)">${washes.join("")}${lines.join("")}${front.join("")}${capLayer.join("")}</g></g>${ring}</svg>`
  );
}

const args = process.argv.slice(2);
const pngAt = args.indexOf("--png");
const pngDir = pngAt >= 0 ? path.resolve(args[pngAt + 1]) : null;
const ids = args.filter((a, i) => /^\d+$/.test(a) && (pngAt < 0 || i !== pngAt + 1));
if (ids.length === 0) {
  console.error("usage: node scripts/player-portrait.mjs <mlbam_id> [...] [--png <dir>]");
  process.exit(1);
}
for (const id of ids) {
  const spec = path.join(DIR, `${id}.json`);
  if (!fs.existsSync(spec)) {
    console.error(`${id}: no ${path.relative(WEB, spec)} (write the features first)`);
    process.exitCode = 1;
    continue;
  }
  const svg = draw(merge(FEATURES, JSON.parse(fs.readFileSync(spec, "utf8"))), Number(id));
  fs.writeFileSync(path.join(DIR, `${id}.svg`), svg);
  let note = "";
  if (pngDir) {
    fs.mkdirSync(pngDir, { recursive: true });
    await sharp(Buffer.from(svg)).resize(600, 600).png().toFile(path.join(pngDir, `${id}.png`));
    note = ` + ${path.join(pngDir, `${id}.png`)}`;
  }
  console.log(`${id}: wrote content/portraits/${id}.svg (${(Buffer.byteLength(svg) / 1024).toFixed(0)} KB)${note}`);
}
