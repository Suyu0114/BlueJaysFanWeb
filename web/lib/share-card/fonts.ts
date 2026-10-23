import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { C, type KindStyle } from "./tokens";

// Fonts, the site logo and player portraits for the share cards (next/og
// ImageResponse) — the site default and the article cards, and the social cards
// the /share-card skill renders. Satori can't read the site's next/font faces,
// so each card fetches its own subset from Google Fonts.

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
 * The site logo (public/brand, drawn by scripts/brand-logo.mjs: navy ink on a
 * papaya die-cut) as a data URL for <img>. `full` = the lettered roundel, for
 * where it's big enough to read (the site card); `mark` = the same ring without
 * lettering, for a card's corner next to the wordmark. On a dark paper it's
 * knocked out: papaya ink, the die-cut in the paper colour. The logo uses the two
 * hexes in fills and strokes alike, so the swap is on the colour, not the attribute.
 */
export async function siteLogo(paper: Pick<KindStyle, "dark" | "paper">, variant: "full" | "mark"): Promise<string> {
  let svg = await readFile(join(process.cwd(), `public/brand/${variant === "full" ? "logo" : "logo-mark"}.svg`), "utf8");
  if (paper.dark) {
    svg = svg.replaceAll(C.papaya, "@cut").replaceAll(C.navy, C.papaya).replaceAll("@cut", paper.paper);
  }
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * A club's cap logo (public/team-logos/<id>.svg, recoloured navy on papaya by
 * etl/fetch_team_logos.py) as a data URL, or null when there's no file. Not
 * knocked out like siteLogo: it is only drawn on article cards and their series
 * parts, which are both parchment.
 */
export async function teamLogo(teamId: number): Promise<string | null> {
  try {
    const svg = await readFile(join(process.cwd(), "public", "team-logos", `${teamId}.svg`));
    return `data:image/svg+xml;base64,${svg.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * A player's cartoon portrait (content/portraits/<mlbam_id>.svg, drawn by
 * scripts/player-portrait.mjs from his feature file via the /player-portrait
 * skill) as a data URL, or null when he has none yet, so the tile falls back to
 * plain text.
 */
export async function playerPortrait(mlbamId: number): Promise<string | null> {
  try {
    const svg = await readFile(join(process.cwd(), "content", "portraits", `${mlbamId}.svg`));
    return `data:image/svg+xml;base64,${svg.toString("base64")}`;
  } catch {
    return null;
  }
}
