import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { C, type KindStyle } from "./tokens";

// Fonts and the cap logo for the share cards (next/og ImageResponse) — the site
// default and the article cards, and the social cards the /share-card skill
// renders. Satori can't read the site's next/font faces, so each card fetches
// its own subset from Google Fonts.

/**
 * One Google Fonts face, only the glyphs in `text` (css2 `text=` subset — a few
 * KB even for Chinese). Satori needs TTF / OTF, which Google serves to a client
 * that doesn't advertise WOFF2 (as a server-side fetch doesn't). Fetched when the
 * image is generated (at build for the static routes); any failure returns null
 * so the caller can fall back instead of failing the build.
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

/**
 * Satori's font list for a card, subset to `text`: Graduate (labels, uppercase
 * included), Gabriela (Latin prose and numbers) and, for zh-TW, Noto Serif TC
 * 400 + 700. null when a Chinese face didn't load: the caller renders the
 * English card instead of boxes for glyphs.
 */
export async function cardFonts(text: string, zh: boolean) {
  const [graduate, gabriela, noto, notoBold] = await Promise.all([
    loadGoogleFont("Graduate", 400, text.toUpperCase() + text),
    loadGoogleFont("Gabriela", 400, text),
    zh ? loadGoogleFont("Noto Serif TC", 400, text) : Promise.resolve(null),
    zh ? loadGoogleFont("Noto Serif TC", 700, text) : Promise.resolve(null),
  ]);
  if (zh && (!noto || !notoBold)) return null;
  return [
    { name: "Graduate", data: graduate, weight: 400 as const },
    { name: "Gabriela", data: gabriela, weight: 400 as const },
    { name: "Noto Serif TC", data: noto, weight: 400 as const },
    { name: "Noto Serif TC", data: notoBold, weight: 700 as const },
  ].flatMap((f) => (f.data ? [{ ...f, data: f.data, style: "normal" as const }] : []));
}

/**
 * The recoloured Jays cap (navy marks on a papaya die-cut) as a data URL for
 * <img>. On a dark paper it's knocked out instead: papaya marks, the die-cut in
 * the paper colour.
 */
export async function capLogo(paper: Pick<KindStyle, "dark" | "paper">): Promise<string> {
  let svg = await readFile(join(process.cwd(), "public/team-logos/141.svg"), "utf8");
  if (paper.dark) {
    svg = svg
      .replaceAll(`fill="${C.papaya}"`, 'fill="@cut"')
      .replaceAll(`fill="${C.navy}"`, `fill="${C.papaya}"`)
      .replaceAll('fill="@cut"', `fill="${paper.paper}"`);
  }
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
