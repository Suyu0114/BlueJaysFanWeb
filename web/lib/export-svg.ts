// P12 M7: export ANY on-page <svg> as a PNG for the articles. Generic on
// purpose (P13 reuses it): it knows nothing about individual charts.
//
// A standalone SVG image can't see the page's CSS, so before rasterising we
//   1. resolve every var(--color-*) (attributes + inline styles) to the literal
//      value on :root, and
//   2. inline the computed paint of elements styled through classes, then drop
//      the classes (which also drops animation states like .anim-paused).
// Known limit: web fonts don't load inside an SVG-as-image, so text falls back
// to a system serif. Accepted (P12 spec §9). The paper + credit footer around
// the chart come from lib/export-png.ts (shared with table PNGs).

import { renderBrandedPng, type BrandedPngOptions } from "./export-png";

const PAINT_PROPS = [
  "fill",
  "stroke",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "stroke-width",
  "stroke-dasharray",
] as const;

function resolveVars(text: string, root: CSSStyleDeclaration): string {
  return text.replace(/var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)/g, (_, name: string, fallback?: string) => {
    const v = root.getPropertyValue(name).trim();
    return v || (fallback ?? "").trim() || "currentColor";
  });
}

function prepareClone(svg: SVGSVGElement, width: number, height: number): SVGSVGElement {
  const root = getComputedStyle(document.documentElement);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const originals = [svg, ...svg.querySelectorAll("*")];
  const copies = [clone, ...clone.querySelectorAll("*")];

  copies.forEach((el, i) => {
    const src = originals[i] as Element | undefined;
    if (src && el.hasAttribute("class")) {
      const cs = getComputedStyle(src);
      for (const p of PAINT_PROPS) {
        if (!el.hasAttribute(p)) {
          const v = cs.getPropertyValue(p);
          if (v && v !== "none" && v !== "normal") el.setAttribute(p, v);
        }
      }
      el.removeAttribute("class");
    }
    for (const attr of [...el.attributes]) {
      if (attr.value.includes("var(")) el.setAttribute(attr.name, resolveVars(attr.value, root));
    }
  });

  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("font-family", "Georgia, 'Times New Roman', serif");
  clone.style.removeProperty("width");
  clone.style.removeProperty("height");
  return clone;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("SVG could not be rasterised"));
    img.src = src;
  });
}

export async function exportSvgAsPng(svg: SVGSVGElement, opts: BrandedPngOptions): Promise<void> {
  const box = svg.getBoundingClientRect();
  const width = Math.max(1, Math.round(box.width));
  const height = Math.max(1, Math.round(box.height));
  const clone = prepareClone(svg, width, height);
  const xml = new XMLSerializer().serializeToString(clone);
  const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`);
  await renderBrandedPng({ width, height, draw: (ctx, x, y) => ctx.drawImage(img, x, y, width, height) }, opts);
}

// The largest <svg> inside a container — Recharts / D3 charts render one main
// surface, possibly next to tiny icon svgs.
export function largestSvg(container: Element): SVGSVGElement | null {
  let best: SVGSVGElement | null = null;
  let bestArea = 0;
  for (const svg of container.querySelectorAll("svg")) {
    const r = svg.getBoundingClientRect();
    const area = r.width * r.height;
    if (area > bestArea) {
      best = svg;
      bestArea = area;
    }
  }
  return best;
}

export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
