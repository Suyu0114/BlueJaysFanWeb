// Any table -> PNG, from the same plain headers + rows (display strings) the
// "Copy table" button gets, so every table on the site exports with no extra
// wiring. Drawn on a canvas in the standings-chrome vocabulary: dirt parchment,
// navy header bar in Graduate, ledger stripes in papaya. Then the shared credit
// footer (lib/export-png.ts).
//
// Known limit: it's the flat table. Per-cell tints (the rank heat map) and the
// Jays-row highlight aren't drawn; ranks still read as text, e.g. "4.12 (3rd)".

import type { Cell } from "./copy-table";
import { exportColors, exportFonts, renderBrandedPng, type BrandedPngOptions } from "./export-png";

const HEAD_H = 26;
const ROW_H = 24;
const PAD_X = 8; // cell side padding (px-2)
const EDGE_X = 12; // outer cell padding (pl-3 / pr-3)
const PARCHMENT = 8; // paper margin around the table

// A column of numbers (".292", "24.5%", "+3.2", "10-11", "4.12 (3rd)") reads
// right-aligned like the on-page tables; a column of words stays left.
const NUMERIC = /^[-+−–]?[.\d]/;

const text = (v: Cell) => (v == null ? "" : String(v).replace(/[\t\r\n]+/g, " ").trim());

export async function exportTableAsPng(headers: Cell[], rows: Cell[][], opts: BrandedPngOptions): Promise<void> {
  const fonts = await exportFonts();
  const color = exportColors();
  const headFont = `11px ${fonts.display}`;
  const cellFont = `13px ${fonts.body}`;

  const head = headers.map((h) => text(h).toUpperCase());
  const body = rows.map((r) => head.map((_, i) => text(r[i])));
  const last = head.length - 1;

  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("Canvas unavailable");
  const widths = head.map((h, i) => {
    measure.font = headFont;
    let w = measure.measureText(h).width;
    measure.font = cellFont;
    for (const r of body) w = Math.max(w, measure.measureText(r[i]).width);
    return Math.ceil(w) + (i === 0 ? EDGE_X : PAD_X) + (i === last ? EDGE_X : PAD_X);
  });
  const rightAligned = head.map((_, i) => {
    if (i === 0) return false;
    const filled = body.map((r) => r[i]).filter(Boolean);
    return filled.length > 0 && filled.filter((v) => NUMERIC.test(v)).length * 2 >= filled.length;
  });

  const tableW = widths.reduce((a, b) => a + b, 0);
  const tableH = HEAD_H + body.length * ROW_H;

  const draw = (ctx: CanvasRenderingContext2D, x0: number, y0: number) => {
    // Parchment under the whole table (ScorecardFrame's bg-dirt/40).
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = color.dirt;
    ctx.fillRect(x0, y0, tableW + PARCHMENT * 2, tableH + PARCHMENT * 2);
    const x = x0 + PARCHMENT;
    const y = y0 + PARCHMENT;

    // Navy header bar, rounded ends (rounded-l-md / rounded-r-md).
    ctx.globalAlpha = 1;
    ctx.fillStyle = color.navy;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, tableW, HEAD_H, 6);
    else ctx.rect(x, y, tableW, HEAD_H);
    ctx.fill();

    // Ledger stripes: papaya/70, papaya/35.
    ctx.fillStyle = color.papaya;
    body.forEach((_, r) => {
      ctx.globalAlpha = r % 2 === 0 ? 0.7 : 0.35;
      ctx.fillRect(x, y + HEAD_H + r * ROW_H, tableW, ROW_H);
    });

    ctx.textBaseline = "middle";
    const cellText = (s: string, i: number, rowY: number, h: number) => {
      let left = x;
      for (let k = 0; k < i; k++) left += widths[k];
      const padL = i === 0 ? EDGE_X : PAD_X;
      const padR = i === last ? EDGE_X : PAD_X;
      ctx.textAlign = rightAligned[i] ? "right" : "left";
      ctx.fillText(s, rightAligned[i] ? left + widths[i] - padR : left + padL, rowY + h / 2);
    };

    ctx.globalAlpha = 1;
    ctx.fillStyle = color.papaya;
    ctx.font = headFont;
    head.forEach((h, i) => cellText(h, i, y, HEAD_H));

    ctx.fillStyle = color.navy;
    ctx.font = cellFont;
    body.forEach((r, ri) => r.forEach((s, i) => cellText(s, i, y + HEAD_H + ri * ROW_H, ROW_H)));
  };

  await renderBrandedPng({ width: tableW + PARCHMENT * 2, height: tableH + PARCHMENT * 2, draw }, opts);
}
