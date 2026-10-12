// The share cards' palette. Satori (next/og) can't read CSS variables or run
// color-mix(), so the @theme tokens in app/globals.css are re-declared here as hex
// (keep them in sync, as the rough.js components do) and every tint the site
// builds with `bg-x/NN` or color-mix is mixed in JS the same way (srgb).

export const C = {
  papaya: "#fdf0d5",
  navy: "#003049",
  steel: "#669bbc",
  lava: "#780000",
  brick: "#c1121f",
  grass: "#84934D",
  dirt: "#DAB681",
} as const;

/** color-mix(in srgb, a p, b) with p = the share of `a` (0..1). */
export function mix(a: string, b: string, p: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2]
    .map((i) => Math.round(ch(a, i) * p + ch(b, i) * (1 - p)).toString(16).padStart(2, "0"))
    .join("")}`;
}

export const navyA = (a: number) => `rgba(0, 48, 73, ${a})`;

/** ScorecardFrame's surface: bg-dirt/40 over the papaya page. */
export const PARCHMENT = mix(C.dirt, C.papaya, 0.4);
/** The season page's stat cards: bg-papaya/60 + border-steel/25, over the parchment. */
export const CARD_BG = mix(C.papaya, PARCHMENT, 0.6);
export const CARD_BORDER = mix(C.steel, PARCHMENT, 0.25);
/** ScorecardFrame's faint inner rule and offset print shadow. */
export const INK_FAINT = navyA(0.28);
export const SHADOW = navyA(0.2);

/** The Δ-chip tones of the season record strip (better / worse / flat). */
export const TONE = {
  better: { bg: mix(C.grass, CARD_BG, 0.25), ink: C.navy },
  worse: { bg: mix(C.brick, CARD_BG, 0.15), ink: C.lava },
  flat: { bg: mix(C.navy, CARD_BG, 0.05), ink: navyA(0.6) },
} as const;

// lib/percentile-color.ts in hex: steel (worst) -> neutral -> brick (best).
const NEUTRAL = mix(C.navy, C.papaya, 0.28);

export function percentileHex(v: number): string {
  const p = Math.max(0, Math.min(100, v));
  return p <= 50 ? mix(C.steel, NEUTRAL, (100 - 2 * p) / 100) : mix(C.brick, NEUTRAL, (2 * p - 100) / 100);
}

/** = rankTint(): the rank chip's background (1st brick … 30th steel, mid ranks near papaya). */
export function rankTintHex(rank: number, of = 30, strength = 45): string {
  const p = of <= 1 ? 50 : (100 * (of - rank)) / (of - 1);
  return mix(percentileHex(p), C.papaya, Math.round((Math.abs(p - 50) / 50) * strength) / 100);
}

/**
 * One accent per kind of post, on the same parchment: the kind tag, the rule
 * under the title and the stamp take it. Brand recognition comes from the frame,
 * the wordmark and the paper; the accent says what kind of post it is.
 */
export type CardKind = "article" | "glossary" | "news";

export type KindStyle = {
  accent: string; // tag border / rule / stamp
  tagFill: string; // tag background
  tagInk: string; // tag text (steel is too light for text on papaya, so navy there)
  tag: { en: string; "zh-TW": string };
};

export const KIND: Record<CardKind, KindStyle> = {
  article: { accent: C.brick, tagFill: mix(C.brick, C.papaya, 0.14), tagInk: C.brick, tag: { en: "Article", "zh-TW": "文章" } },
  glossary: { accent: C.steel, tagFill: mix(C.steel, C.papaya, 0.3), tagInk: C.navy, tag: { en: "Baseball 101", "zh-TW": "棒球名詞" } },
  news: { accent: C.lava, tagFill: mix(C.lava, C.papaya, 0.12), tagInk: C.lava, tag: { en: "News", "zh-TW": "時事" } },
};

/**
 * Review option for News: the site header's look (navy tag, papaya text, brick
 * rule) instead of lava, which sits close to the article's brick at feed size.
 */
export const NEWS_NAVY: KindStyle = { accent: C.navy, tagFill: C.navy, tagInk: C.papaya, tag: KIND.news.tag };
