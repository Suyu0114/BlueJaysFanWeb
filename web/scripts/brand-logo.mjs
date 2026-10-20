// ONE-SHOT: draws the site logo (the "SN roundel") and exports its PNGs.
//
// Usage (from web/):  node scripts/brand-logo.mjs
//
// Writes (committed):
//   public/brand/logo.svg              full roundel: SUYU'S JAYS NOTES / EST. 2026 on a stitched navy band, SN in the middle
//   public/brand/logo-mark.svg         the same ring without lettering, for small sizes (favicon, share-card corner),
//                                      where the band's lettering would only be noise
//   public/brand/apple-touch-icon.png  180 px, full roundel on papaya (iOS ignores SVG icons)
// and, git-ignored, the profile pictures to upload by hand:
//   ../reports/brand/avatar-{ig-320,x-400,1080}-{light,dark}.png
//
// Built like public/team-logos (etl/fetch_team_logos.py): two colours only, navy ink and
// papaya, with a papaya die-cut around the mark, so lib/share-card/fonts.ts can knock it out
// on a dark paper by swapping the two hexes. The letters are Graduate (SIL OFL, the site's
// display face) outlines baked in as paths, so no font is needed to draw the SVG. sharp
// comes through next (its own image dependency), so this script adds no package.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve("next/package.json"))("sharp");

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BRAND = path.join(WEB, "public", "brand");
const AVATARS = path.join(WEB, "..", "reports", "brand");

// Keep in sync with the @theme block in app/globals.css (as lib/share-card/tokens.ts does).
const NAVY = "#003049";
const PAPAYA = "#fdf0d5";
const DIRT = "#dab681";

/** color-mix(in srgb, a p, b), as lib/share-card/tokens.ts mix(). */
function mix(a, b, p) {
  const ch = (h, i) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2]
    .map((i) => Math.round(ch(a, i) * p + ch(b, i) * (1 - p)).toString(16).padStart(2, "0"))
    .join("")}`;
}
/** The share cards' parchment (ScorecardFrame's bg-dirt/40 over papaya). */
const PARCHMENT = mix(DIRT, PAPAYA, 0.4);

// Graduate glyphs: [advance, outline] in font units (1000 / em, cap height 750, y up).
const G = {
  S: [600, "M438 288 390 337H182L80 444V640L184 750H416L520 640V514H437V602L377 664H224L172 611V473L221 423H429L530 317V110L426 0H174L70 110V236H153V148L214 86H387L438 139Z"],
  N: [812, "M534 0 242 636V80H312V0H80V80H150V670H80V750H288L580 113V670H510V750H742V670H672V0Z"],
  U: [740, "M448 750H670V670H610V110L506 0H234L130 110V670H70V750H292V670H222V139L273 86H466L518 139V670H448Z"],
  Y: [607, "M440 0H168V80H258V234L70 670H20V750H232V670H158L303 333L448 670H375V750H587V670H536L350 237V80H440Z"],
  J: [540, "M163 86H276L328 139V670H258V750H480V670H420V110L316 0H124L20 110V286H100V151Z"],
  A: [657, "M195 750H462V670H416L592 80H642V0H430V80H500L454 234H203L157 80H227V0H15V80H65L241 670H195ZM328 655 227 314H430Z"],
  O: [650, "M184 0 80 110V640L184 750H466L570 640V110L466 0ZM223 86H426L478 139V611L427 664H224L172 611V139Z"],
  T: [580, "M436 0H144V80H244V670H96V554H20V750H560V554H484V670H336V80H436Z"],
  E: [636, "M80 750H556V554H476V670H242V415H476V335H242V80H476V196H556V0H80V80H150V670H80Z"],
  ".": [200, "M50 120H150V0H50Z"],
  "2": [650, "M545 0H85V80L438 473V611L386 664H233L173 602V514H90V640L194 750H426L530 640V444L197 80H465V196H545Z"],
  "0": [650, "M184 0 80 110V640L184 750H466L570 640V110L466 0ZM223 86H426L483 144V606L427 664H224L167 606V144ZM275 435H375V315H275Z"],
  "6": [650, "M560 110 456 0H204L100 110V640L204 750H436L540 640V514H457V602L397 664H244L187 606V433H459L560 327ZM414 353H187V144L244 86H417L468 139V298Z"],
  "'": [240, "M70 800H170V700L140 550H100L70 700Z"],
  " ": [350, ""],
};
const CAP = 750;
/** Ink extent (x) of the two monogram letters, for centring them. */
const INK_X = { S: [70, 530], N: [80, 742] };

const f = (n) => +n.toFixed(2);

// ---- the monogram ---------------------------------------------------------------------------

/** S and N at cap height h, overlapped (S in front), the pair centred on (150, 150). */
function monogram(h, { bold, gap }) {
  const k = h / CAP;
  // S's centre sits 0.31 h left of the pair's centre, N's 0.17 h right: S's right column
  // covers N's left stem, which reads as SN down to a 16 px favicon.
  const place = (ch, cx) => {
    const [x0, x1] = INK_X[ch];
    return `translate(${f(cx - ((x0 + x1) / 2) * k)} ${f(150 + (CAP / 2) * k)}) scale(${f(k)} ${f(-k)})`;
  };
  const sCx = 150 - 0.3105 * h;
  const nCx = 150 + 0.1737 * h;
  const path = (ch, tf, fill, w) =>
    `<path d="${G[ch][1]}" transform="${tf}" fill="${fill}" stroke="${fill}" stroke-width="${f(w / k)}" stroke-miterlimit="2"/>`;
  // Behind S, N's left stem showed through S's right-hand opening (closing the S), left a
  // hairline in its counters and poked its bottom-left serif out under S's tail. Clip the
  // stem and serif away below the top of S's right-hand stroke; the stem's top corner stays,
  // peeking over S, which is what makes the N read.
  const nX = (fx) => nCx + (fx - (INK_X.N[0] + INK_X.N[1]) / 2) * k;
  const base = 150 + (CAP / 2) * k;
  const xa = nX(150) - bold / 2 + 1; // stem's left edge, trimmed (top corner only)
  const xs = nX(242) + bold / 2 + 0.5; // stem's right edge
  const xc = nX(312) + bold / 2 + 0.5; // bottom-left serif's right end
  const ys = base - 640 * k; // where S's right-hand stroke starts below its top corner
  const yb = base - 80 * k - bold / 2 - 0.5; // bottom serif's top
  return {
    defs: `<clipPath id="sn-n"><path d="M${f(xa)} 0H300V300H${f(xc)}V${f(yb)}H${f(xs)}V${f(ys)}H${f(xa)}Z"/></clipPath>`,
    body:
      `<g clip-path="url(#sn-n)">${path("N", place("N", nCx), NAVY, bold)}</g>` +
      path("S", place("S", sCx), PAPAYA, bold + 2 * gap) +
      path("S", place("S", sCx), NAVY, bold),
  };
}

// ---- the ring ---------------------------------------------------------------------------------

/** A running stitch around a circle, its dashes dividing the circumference evenly (no seam). */
function stitch(r, { dash = 4.2, space = 3.4, width = 1.8 } = {}) {
  const c = 2 * Math.PI * r;
  const s = c / Math.round(c / (dash + space)) / (dash + space);
  return `<circle cx="150" cy="150" r="${f(r)}" fill="none" stroke="${PAPAYA}" stroke-width="${width}" stroke-dasharray="${f(dash * s)} ${f(space * s)}" stroke-linecap="round"/>`;
}

/** Text set on a circle, Graduate outlines: over the top (reads clockwise) or along the bottom. */
function arcText(text, r, cap, { top, track }) {
  const k = cap / CAP;
  const chars = [...text];
  const step = chars.map((ch) => G[ch][0] * k + cap * track);
  const width = step.reduce((a, b) => a + b, 0) - cap * track;
  let x = 0;
  return chars
    .map((ch, i) => {
      const [adv, d] = G[ch];
      const mid = x + (adv * k) / 2;
      x += step[i];
      if (!d) return "";
      const th = top ? -Math.PI / 2 + (mid - width / 2) / r : Math.PI / 2 - (mid - width / 2) / r;
      const rot = (th * 180) / Math.PI + (top ? 90 : -90);
      return `<path d="${d}" transform="translate(${f(150 + r * Math.cos(th))} ${f(150 + r * Math.sin(th))}) rotate(${f(rot)}) translate(${f((-adv * k) / 2)} 0) scale(${f(k)} ${f(-k)})" fill="${PAPAYA}"/>`;
    })
    .join("");
}

/** A papaya baseball on the band (the separators at 3 and 9 o'clock). */
function ball(cx) {
  const r = 7.5;
  const seam = (s) => `M${f(cx + s * 3.4)} ${f(150 - 5.9)} Q${f(cx + s * 0.7)} 150 ${f(cx + s * 3.4)} ${f(150 + 5.9)}`;
  return (
    `<circle cx="${f(cx)}" cy="150" r="${r}" fill="${PAPAYA}"/>` +
    `<path d="${seam(-1)} ${seam(1)}" fill="none" stroke="${NAVY}" stroke-width="1.5" stroke-linecap="round"/>`
  );
}

const svg = (defs, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><title>Suyu's Jays Notes</title><defs>${defs}</defs>${body}</svg>\n`;

/** The full roundel: lettered band, stitched edges, SN. */
function roundel() {
  const R = 142, band = 40, cut = 7, cap = 17;
  const ri = R - band;
  const mid = R - band / 2;
  const sn = monogram(116, { bold: 5, gap: 5 });
  return svg(
    sn.defs,
    [
      `<circle cx="150" cy="150" r="${R + cut}" fill="${PAPAYA}"/>`,
      `<circle cx="150" cy="150" r="${R}" fill="${NAVY}"/>`,
      stitch(R - 4.5),
      stitch(ri + 4.5),
      arcText("SUYU'S JAYS NOTES", mid - cap / 2, cap, { top: true, track: 0.12 }),
      arcText("EST. 2026", mid + cap / 2, cap, { top: false, track: 0.22 }),
      ball(150 - mid),
      ball(150 + mid),
      `<circle cx="150" cy="150" r="${ri}" fill="${PAPAYA}"/>`,
      sn.body,
    ].join(""),
  );
}

/** The small-size mark: a thinner stitched ring and a bigger SN, no lettering. */
function mark() {
  const R = 142, band = 22, cut = 7;
  const sn = monogram(138, { bold: 7, gap: 6 });
  return svg(
    sn.defs,
    [
      `<circle cx="150" cy="150" r="${R + cut}" fill="${PAPAYA}"/>`,
      `<circle cx="150" cy="150" r="${R}" fill="${NAVY}"/>`,
      stitch(R - band / 2, { dash: 5, space: 4, width: 2.2 }),
      `<circle cx="150" cy="150" r="${R - band}" fill="${PAPAYA}"/>`,
      sn.body,
    ].join(""),
  );
}

// ---- PNGs ---------------------------------------------------------------------------------------

/** The mark knocked out for a dark paper: navy <-> papaya, the die-cut in the paper colour. */
const knockOut = (s, paper) => s.replaceAll(PAPAYA, "@cut").replaceAll(NAVY, PAPAYA).replaceAll("@cut", paper);

/** A square PNG: paper fill, the logo at `fill` of the width, centred. */
function square(logo, size, paper, fill) {
  const m = size * fill;
  const o = (size - m) / 2;
  const inner = logo.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const page = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${paper}"/><svg x="${o}" y="${o}" width="${m}" height="${m}" viewBox="0 0 300 300">${inner}</svg></svg>`;
  return sharp(Buffer.from(page)).png();
}

const logo = roundel();
fs.mkdirSync(BRAND, { recursive: true });
fs.mkdirSync(AVATARS, { recursive: true });
fs.writeFileSync(path.join(BRAND, "logo.svg"), logo);
fs.writeFileSync(path.join(BRAND, "logo-mark.svg"), mark());
await square(logo, 180, PAPAYA, 0.92).toFile(path.join(BRAND, "apple-touch-icon.png"));

// IG / X crop the picture to a circle; the roundel sits at 88 % of it.
for (const [name, size] of [["ig-320", 320], ["x-400", 400], ["1080", 1080]]) {
  await square(logo, size, PARCHMENT, 0.88).toFile(path.join(AVATARS, `avatar-${name}-light.png`));
  await square(knockOut(logo, NAVY), size, NAVY, 0.88).toFile(path.join(AVATARS, `avatar-${name}-dark.png`));
}
console.log(`logo.svg + logo-mark.svg + apple-touch-icon.png -> ${BRAND}\navatars -> ${AVATARS}`);
