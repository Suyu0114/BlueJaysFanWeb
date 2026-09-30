// P12 M7: export ANY on-page <svg> as a PNG for the articles. Generic on
// purpose (P13 reuses it): it knows nothing about individual charts.
//
// A standalone SVG image can't see the page's CSS, so before rasterising we
//   1. resolve every var(--color-*) (attributes + inline styles) to the literal
//      value on :root, and
//   2. inline the computed paint of elements styled through classes, then drop
//      the classes (which also drops animation states like .anim-paused).
// Known limit: web fonts don't load inside an SVG-as-image, so text falls back
// to a system serif. Accepted (P12 spec §9).

export const EXPORT_SOURCE = "Blue Jays Fan Hub · Baseball Savant / MLB Stats API";

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

export type ExportPngOptions = {
  filename: string; // without extension
  caption?: string; // e.g. "Vladimir Guerrero Jr. · Spray chart · 2026"
  scale?: number; // default 2 (retina-sharp in articles)
};

export async function exportSvgAsPng(svg: SVGSVGElement, opts: ExportPngOptions): Promise<void> {
  const scale = opts.scale ?? 2;
  const box = svg.getBoundingClientRect();
  const width = Math.max(1, Math.round(box.width));
  const height = Math.max(1, Math.round(box.height));
  const clone = prepareClone(svg, width, height);
  const xml = new XMLSerializer().serializeToString(clone);
  const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`);

  const root = getComputedStyle(document.documentElement);
  const paper = root.getPropertyValue("--color-papaya").trim() || "#fdf0d5";
  const ink = root.getPropertyValue("--color-navy").trim() || "#003049";
  const pad = 12;
  const CAPTION_FONT = "12px Georgia, 'Times New Roman', serif";
  const SOURCE_FONT = "10px Georgia, 'Times New Roman', serif";
  const source = `${EXPORT_SOURCE} · ${new Date().toISOString().slice(0, 10)}`;

  // Caption left + source right on one line when both fit; otherwise stacked
  // (narrow charts like the zone grid), each allowed the full width.
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("Canvas unavailable");
  measure.font = CAPTION_FONT;
  const captionW = opts.caption ? measure.measureText(opts.caption).width : 0;
  measure.font = SOURCE_FONT;
  const sourceW = measure.measureText(source).width;
  const oneLine = captionW + sourceW + 24 <= width;
  const footer = oneLine || !opts.caption ? 30 : 46;
  // Very narrow charts (a zone grid) widen the canvas so the footer text isn't
  // squeezed; the chart is centred on the extra paper.
  const inner = oneLine ? width : Math.max(width, Math.ceil(Math.max(captionW, sourceW)));
  const offset = (inner - width) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = (inner + pad * 2) * scale;
  canvas.height = (height + pad * 2 + footer) * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.scale(scale, scale);
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, inner + pad * 2, height + pad * 2 + footer);
  ctx.drawImage(img, pad + offset, pad, width, height);

  ctx.fillStyle = ink;
  ctx.textBaseline = "middle";
  const top = height + pad * 2;
  if (opts.caption) {
    ctx.globalAlpha = 0.7;
    ctx.font = CAPTION_FONT;
    ctx.fillText(opts.caption, pad, top + 11, inner);
  }
  ctx.globalAlpha = 0.5;
  ctx.font = SOURCE_FONT;
  if (oneLine || !opts.caption) {
    ctx.textAlign = "right";
    ctx.fillText(source, inner + pad, top + 11, inner);
  } else {
    ctx.fillText(source, pad, top + 29, inner);
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
