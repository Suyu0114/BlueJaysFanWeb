import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Shared pieces for the share images (next/og ImageResponse): the site default
// (app/[locale]/opengraph-image.tsx) and one per article
// (app/[locale]/articles/[slug]/opengraph-image.tsx). Satori can't read CSS
// variables, so the palette is re-declared as hex — keep it in sync with the
// @theme block in app/globals.css (as the rough.js components do).

export const OG_SIZE = { width: 1200, height: 630 };

export const OG = {
  papaya: "#fdf0d5",
  navy: "#003049",
  steel: "#669bbc",
  brick: "#c1121f",
  dirt: "#DAB681",
} as const;

/**
 * One Google Fonts face, only the glyphs in `text` (css2 `text=` subset — a few
 * KB even for Chinese). Satori needs TTF / OTF, which Google serves to a client
 * that doesn't advertise WOFF2 (as a server-side fetch doesn't). Fetched when the
 * image is generated (at build for these static routes); any failure returns
 * null so the caller can fall back instead of failing the build.
 */
export async function loadGoogleFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(
        `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}&text=${encodeURIComponent(text)}`,
      )
    ).text();
    const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!src) return null;
    const res = await fetch(src);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** Satori font entries for the faces that loaded (missing ones are dropped). */
export function ogFonts(faces: { name: string; data: ArrayBuffer | null; weight: 400 | 700 }[]) {
  return faces.flatMap((f) => (f.data ? [{ name: f.name, data: f.data, weight: f.weight, style: "normal" as const }] : []));
}

/** The recoloured Jays cap (navy on papaya) as a data URL for <img>. */
export async function capLogo(): Promise<string> {
  const svg = await readFile(join(process.cwd(), "public/team-logos/141.svg"));
  return `data:image/svg+xml;base64,${svg.toString("base64")}`;
}
