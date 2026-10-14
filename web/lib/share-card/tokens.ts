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

/** A hex colour at alpha `a`, as rgba() (Satori's SVG strokes don't take 8-digit hex). */
export function alpha(hex: string, a: number): string {
  const ch = (i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `rgba(${ch(0)}, ${ch(1)}, ${ch(2)}, ${a})`;
}

export const navyA = (a: number) => alpha(C.navy, a);

/** A kind's ink at alpha `a`, eased by its `fade` (secondary text on the paper). */
export const softInk = (s: { ink: string; fade: number }, a: number) => alpha(s.ink, 1 - (1 - a) * s.fade);

/** ScorecardFrame's surface: bg-dirt/40 over the papaya page. */
export const PARCHMENT = mix(C.dirt, C.papaya, 0.4);
/** The season page's stat card fill (bg-papaya/60 over the parchment): the base the Δ-chip tones mix into. */
export const CARD_BG = mix(C.papaya, PARCHMENT, 0.6);
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
 * Each kind of post has its own paper, so a feed of them doesn't read as one
 * colour: light / mid / dark — Article on the site's parchment, Baseball 101 on
 * steel, News on navy (the author's pick of four schemes, 2026-10-13). The brand
 * stays in what doesn't change: the hand-drawn frame, wordmark, cap and type.
 * Every paper is mixed from the @theme tokens. A dark paper flips the ink to
 * papaya (frame, text, the cap's knock-out); stat / note cards stay light papaya
 * with navy text on every paper, so the rank and Δ chips keep their tints.
 */
export type CardKind = "article" | "glossary" | "news" | "part";

export type KindStyle = {
  paper: string; // the card surface
  dark: boolean; // papaya ink on a dark paper
  ink: string; // text + the frame's outer line
  accent: string; // tag border
  tagFill: string; // tag background
  tagInk: string; // tag text
  rule: string; // the hand-drawn rule under the title
  stamp: string; // News date stamp
  card: string; // stat / note cards on the paper
  cardBorder: string;
  fade: number; // how far secondary text fades toward the paper (1 = as asked; less on a mid paper, where faded ink loses contrast fast)
  tag: { en: string; "zh-TW": string };
};

/** A paper and its accents, before a kind takes it (and its tag). */
type Paper = Omit<KindStyle, "tag">;
type Accents = Pick<KindStyle, "accent" | "tagFill" | "tagInk" | "rule" | "stamp">;

/** Navy ink. `mid` = a mid-tone paper: cards nearly papaya (the site's bg-papaya/60 turns grey there) and less fade. */
const light = (paper: string, a: Accents, mid = false): Paper => ({
  paper,
  dark: false,
  ink: C.navy,
  card: mix(C.papaya, paper, mid ? 0.9 : 0.6),
  cardBorder: mix(C.steel, paper, 0.25),
  fade: mid ? 0.55 : 1,
  ...a,
});

const dark = (paper: string, a: Accents): Paper => ({
  paper,
  dark: true,
  ink: C.papaya,
  card: C.papaya,
  cardBorder: C.papaya,
  fade: 1,
  ...a,
});

const INDEX_CARD = mix(C.steel, C.papaya, 0.35);
const BULLETIN = mix(C.brick, C.papaya, 0.18);

/**
 * Every paper reviewed so far. KIND uses the first three; the rest are spares
 * the author kept from the 2026-10-12 review for a future kind (renders in
 * reports/share-cards/paper-review/, git-ignored) — hand one to a kind below.
 */
export const PAPERS = {
  /** The site's own scorecard (bg-dirt/40): an article's link preview looks like the site. */
  parchment: light(PARCHMENT, { accent: C.brick, tagFill: mix(C.brick, C.papaya, 0.14), tagInk: C.brick, rule: C.brick, stamp: C.brick }),
  /** Mid steel, still light enough for navy body text (≈ 6:1); the site's accent colour. */
  steel: light(mix(C.steel, C.papaya, 0.75), { accent: C.navy, tagFill: C.navy, tagInk: C.papaya, rule: C.navy, stamp: C.navy }, true),
  /** The site header: papaya ink, brick tag, steel date stamp (steel = "today" on the site's calendar). Neutral for good and bad news alike. */
  navy: dark(C.navy, { accent: C.brick, tagFill: C.brick, tagInk: C.papaya, rule: C.brick, stamp: C.steel }),

  // ---- spares ----
  /** Pale blue-grey index card: steel into papaya. */
  indexCard: light(INDEX_CARD, { accent: C.navy, tagFill: mix(C.papaya, INDEX_CARD, 0.6), tagInk: C.navy, rule: C.navy, stamp: C.navy }),
  /** Navy chalkboard with steel accents (reads apart from the brick-tagged navy above). */
  navyBoard: dark(C.navy, { accent: C.steel, tagFill: C.steel, tagInk: C.navy, rule: C.steel, stamp: C.steel }),
  /** Pale red bulletin: brick into papaya, lava accents. */
  bulletin: light(BULLETIN, { accent: C.lava, tagFill: mix(C.papaya, BULLETIN, 0.6), tagInk: C.lava, rule: C.lava, stamp: C.lava }),
  /** Deep lava red, papaya ink. The loudest; red means "worse" on the site, so it suits bad news only. */
  lava: dark(C.lava, { accent: C.papaya, tagFill: C.papaya, tagInk: C.lava, rule: C.papaya, stamp: C.papaya }),
} satisfies Record<string, Paper>;

const ARTICLE_TAG = { en: "Article", "zh-TW": "文章" };

export const KIND: Record<CardKind, KindStyle> = {
  article: { ...PAPERS.parchment, tag: ARTICLE_TAG },
  glossary: { ...PAPERS.steel, tag: { en: "Baseball 101", "zh-TW": "棒球名詞" } },
  news: { ...PAPERS.navy, tag: { en: "News", "zh-TW": "時事" } },
  // An article's series parts are its own pages (they follow its card in an
  // Instagram carousel), so they keep the article's paper and tag.
  part: { ...PAPERS.parchment, tag: ARTICLE_TAG },
};
