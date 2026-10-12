import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getArticle } from "@/content/articles";
import type { CardStatKey, PlayerExample } from "./stats";
import type { CardKind } from "./tokens";

// What a share card says. Article cards come from the article registry
// (content/articles/index.ts: title, date + `card`); Baseball 101 and News cards
// are JSON specs in content/cards/<kind>/<slug>.json, so the same files can back
// site pages later. Numbers are stored as DB keys, never as values: the card
// reads them at render time, so it can't disagree with the site.

export type Localized = { en: string; "zh-TW"?: string };

/** The reader's language if the spec has it, else English. */
export const pick = (t: Localized, locale: string) => (locale === "zh-TW" && t["zh-TW"]) || t.en;

export type ArticleCard = {
  kind: "article";
  slug: string;
  date: string; // YYYY-MM-DD
  title: Localized;
  season: number;
  stats: CardStatKey[]; // 2–3: "record" or any team metric key (022 views)
};

export type GlossaryCard = {
  kind: "glossary";
  slug: string;
  date: string;
  number: number; // series number: "No. 001"
  term: string; // jargon, English in both languages, case kept (wRC+)
  aka?: string; // what the abbreviation stands for, English
  definition: Localized; // one or two plain-language sentences
  scale?: { value: string; label: Localized }[]; // reading guide, e.g. 100 = average
  example?: PlayerExample; // a Blue Jay's value from the DB
};

export type NewsCard = {
  kind: "news";
  slug: string;
  date: string; // the day it happened
  headline: Localized;
  deck?: Localized;
  facts?: { label: Localized; value: string }[]; // up to 3
  source: string; // where the facts come from
};

export type CardSpec = ArticleCard | GlossaryCard | NewsCard;

export const CARD_KINDS: CardKind[] = ["article", "glossary", "news"];

/** The spec for `kind` / `slug`, or null (unknown slug, no `card` config, bad file). */
export async function loadCardSpec(kind: CardKind, slug: string): Promise<CardSpec | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  if (kind === "article") {
    const a = getArticle(slug);
    if (!a?.card) return null;
    return {
      kind,
      slug,
      date: a.date,
      title: { en: a.title.en ?? slug, "zh-TW": a.title["zh-TW"] },
      season: a.card.season,
      stats: a.card.stats,
    };
  }
  try {
    const spec = JSON.parse(await readFile(join(process.cwd(), "content", "cards", kind, `${slug}.json`), "utf8"));
    return spec?.kind === kind && spec?.slug === slug ? (spec as CardSpec) : null;
  } catch {
    return null;
  }
}
