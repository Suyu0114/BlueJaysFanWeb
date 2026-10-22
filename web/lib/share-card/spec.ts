import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getArticle } from "@/content/articles";
import type { CardStatKey, GlossaryExample } from "./stats";
import type { CardKind } from "./tokens";

// What a share card says. Article cards come from the article registry
// (content/articles/index.ts: title, date + `card`); Baseball 101, News and an
// article's series parts are JSON specs in content/cards/<kind>/<slug>.json, so
// the same files can back site pages later. Team and player numbers are stored
// as DB keys, never as values: the card reads them at render time, so it can't
// disagree with the site. `facts` are the exception — written values (a score,
// a position's HR), checked against the DB when the spec is written.

export type Localized = { en: string; "zh-TW"?: string };

/** The reader's language if the spec has it, else English. */
export const pick = (t: Localized, locale: string) => (locale === "zh-TW" && t["zh-TW"]) || t.en;

/**
 * A written value and its label (News facts, series-part facts). `player` (MLBAM id) puts that player's
 * hand-drawn portrait on the tile, when content/portraits/<id>.png exists (the /player-portrait skill).
 */
export type Fact = { label: Localized; value: string; player?: number };

export type ArticleCard = {
  kind: "article";
  slug: string;
  date: string; // YYYY-MM-DD
  title: Localized;
  season?: number; // the stat cards' season (registry `card`); none = title only
  stats: CardStatKey[]; // 0 or 2–3: "record" or any team metric key (022 views)
};

export type GlossaryCard = {
  kind: "glossary";
  slug: string;
  date: string;
  number: number; // series number: "No. 001"
  term: string; // jargon, English in both languages, case kept (wRC+)
  aka?: string; // what the abbreviation stands for, English
  definition: Localized; // one or two plain-language sentences; "\n" breaks a line, a line starting "1. " is a numbered step
  scale?: { value: string; label: Localized }[]; // reading guide, e.g. 100 = average
  example?: GlossaryExample; // from the DB: a Blue Jay's or the team's value by season, several Jays in one season, or the record vs expected
};

export type NewsCard = {
  kind: "news";
  slug: string;
  date: string; // the day it happened
  headline: Localized;
  deck?: Localized;
  facts?: Fact[]; // up to 3
  source: string; // where the facts come from
};

/**
 * One part of an article's social series: a takeaway with its numbers, posted
 * one by one on X and Instagram, on the article card's paper. The file
 * (content/cards/part/<article slug>.json) holds every part; this is one of
 * them, resolved.
 */
export type PartCard = {
  kind: "part";
  slug: string; // the article's slug
  date: string; // the article's date (byline)
  series: Localized; // short series name over the title, "2026 season review"
  index: number; // 1-based
  total: number;
  title: Localized;
  text?: Localized; // one or two sentences
  season?: number;
  stats: CardStatKey[]; // live team values, the article card's stat cards
  facts: Fact[]; // up to 3 tiles in all with `stats`
};

type PartFile = {
  kind: "part";
  slug: string;
  series: Localized;
  season?: number;
  parts: { title: Localized; text?: Localized; stats?: CardStatKey[]; facts?: Fact[] }[];
};

export type CardSpec = ArticleCard | GlossaryCard | NewsCard | PartCard;

export const CARD_KINDS: CardKind[] = ["article", "glossary", "news", "part"];

/**
 * The spec for `kind` / `slug` (and `part`, 1-based, for a series part), or null
 * (unknown slug or part, bad file). An article without `card` gets a title-only card.
 */
export async function loadCardSpec(kind: CardKind, slug: string, part?: number): Promise<CardSpec | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  if (kind === "article") {
    const a = getArticle(slug);
    if (!a) return null;
    return {
      kind,
      slug,
      date: a.date,
      title: { en: a.title.en ?? a.title["zh-TW"] ?? slug, "zh-TW": a.title["zh-TW"] },
      season: a.card?.season,
      stats: a.card?.stats ?? [],
    };
  }
  const spec = await readSpec(kind, slug);
  if (spec?.kind !== kind || spec?.slug !== slug) return null;
  if (kind !== "part") return spec as CardSpec;

  const file = spec as PartFile;
  const a = getArticle(slug);
  const p = part ? file.parts[part - 1] : undefined;
  if (!a || !p) return null;
  return {
    kind,
    slug,
    date: a.date,
    series: file.series,
    index: part!,
    total: file.parts.length,
    title: p.title,
    text: p.text,
    season: file.season,
    stats: p.stats ?? [],
    facts: p.facts ?? [],
  };
}

async function readSpec(kind: CardKind, slug: string): Promise<{ kind?: string; slug?: string } | null> {
  try {
    return JSON.parse(await readFile(join(process.cwd(), "content", "cards", kind, `${slug}.json`), "utf8"));
  } catch {
    return null;
  }
}
