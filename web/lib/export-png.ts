// The shared back half of every PNG export (charts via export-svg.ts, tables
// via export-table.ts): papaya paper, the body, a brick rule, and the credit
// footer (caption · site wordmark · host / data sources / date), then download.
//
// The footer is drawn straight onto the canvas, so unlike an SVG-as-image it
// can use the page's own web fonts: Graduate for the wordmark (as in the
// header), Gabriela for the caption and source line. Georgia if they fail.

import { DATA_SOURCES, SITE, siteHost } from "./site";

const FALLBACK_FONT = "Georgia, 'Times New Roman', serif";

export type ExportFonts = { display: string; body: string };

/** next/font's real family names (set as CSS vars on <html>), loaded and ready for canvas text. */
export async function exportFonts(): Promise<ExportFonts> {
  const root = getComputedStyle(document.documentElement);
  const family = (v: string) => [root.getPropertyValue(v).trim(), FALLBACK_FONT].filter(Boolean).join(", ");
  const fonts = { display: family("--font-graduate"), body: family("--font-gabriela") };
  try {
    await Promise.all([document.fonts.load(`13px ${fonts.display}`), document.fonts.load(`12px ${fonts.body}`)]);
  } catch {
    // The fallback stack still renders.
  }
  return fonts;
}

/** Brand tokens as literal colours (canvas can't read var()). */
export function exportColors() {
  const root = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => root.getPropertyValue(`--color-${name}`).trim() || fallback;
  return {
    papaya: token("papaya", "#fdf0d5"),
    navy: token("navy", "#003049"),
    brick: token("brick", "#c1121f"),
    dirt: token("dirt", "#DAB681"),
  };
}

export type BrandedPngOptions = {
  filename: string; // without extension
  caption?: string; // e.g. "Vladimir Guerrero Jr. · Spray chart · 2026"
  scale?: number; // default 2 (retina-sharp in articles)
};

export type PngBody = {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, x: number, y: number) => void;
};

const PAD = 12;
const GAP = 24; // min space between caption and wordmark on one row
const ROW = 17; // caption / wordmark row height
const SOURCE_ROW = 14;

export async function renderBrandedPng(body: PngBody, opts: BrandedPngOptions): Promise<void> {
  const scale = opts.scale ?? 2;
  const fonts = await exportFonts();
  const color = exportColors();
  const captionFont = `12px ${fonts.body}`;
  const wordFont = `13px ${fonts.display}`;
  const sourceFont = `10px ${fonts.body}`;
  const wordmark = SITE.name.toUpperCase();
  const source = `${siteHost()} · Data: ${DATA_SOURCES} · ${new Date().toISOString().slice(0, 10)}`;

  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("Canvas unavailable");
  const widthOf = (text: string, font: string) => {
    measure.font = font;
    return measure.measureText(text).width;
  };
  const captionW = opts.caption ? widthOf(opts.caption, captionFont) : 0;
  const wordW = widthOf(wordmark, wordFont);
  const sourceW = widthOf(source, sourceFont);

  // Caption left + wordmark right, source under them right-aligned, when it
  // fits; otherwise (narrow charts like the zone grid) everything stacks
  // left-aligned and the paper widens so no line is squeezed. The body is
  // centred on the extra paper.
  const wide = captionW + wordW + GAP <= body.width && sourceW <= body.width;
  const inner = wide ? body.width : Math.ceil(Math.max(body.width, captionW, wordW, sourceW));
  const offset = (inner - body.width) / 2;
  const textRows = wide ? ROW + SOURCE_ROW : (opts.caption ? ROW : 0) + ROW + SOURCE_ROW;
  const footer = 8 + 1 + 8 + textRows;
  const totalW = inner + PAD * 2;
  const totalH = PAD + body.height + footer + PAD;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(totalW * scale);
  canvas.height = Math.round(totalH * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.scale(scale, scale);
  ctx.fillStyle = color.papaya;
  ctx.fillRect(0, 0, totalW, totalH);
  ctx.save();
  body.draw(ctx, PAD + offset, PAD);
  ctx.restore();

  const ruleY = PAD + body.height + 8;
  ctx.strokeStyle = color.brick;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, ruleY + 0.5);
  ctx.lineTo(PAD + inner, ruleY + 0.5);
  ctx.stroke();

  ctx.fillStyle = color.navy;
  ctx.textBaseline = "middle";
  let y = ruleY + 1 + 8;
  const text = (s: string, font: string, alpha: number, align: CanvasTextAlign, rowH: number, maxW: number) => {
    ctx.font = font;
    ctx.globalAlpha = alpha;
    ctx.textAlign = align;
    ctx.fillText(s, align === "right" ? PAD + inner : PAD, y + rowH / 2, maxW);
  };
  if (wide) {
    if (opts.caption) text(opts.caption, captionFont, 0.7, "left", ROW, inner - wordW - GAP);
    text(wordmark, wordFont, 0.9, "right", ROW, inner);
    y += ROW;
    text(source, sourceFont, 0.5, "right", SOURCE_ROW, inner);
  } else {
    if (opts.caption) {
      text(opts.caption, captionFont, 0.7, "left", ROW, inner);
      y += ROW;
    }
    text(wordmark, wordFont, 0.9, "left", ROW, inner);
    y += ROW;
    text(source, sourceFont, 0.5, "left", SOURCE_ROW, inner);
  }

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("PNG encoding failed");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${opts.filename}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
