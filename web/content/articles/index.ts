import type { Locale } from "@/i18n/routing";
import type { CardStatKey } from "@/lib/share-card/stats";

// The article registry: one entry per article, newest first. The body lives in
// content/articles/<slug>/<locale>.mdx. Titles and summaries are here (not in
// MDX frontmatter) so the list page and metadata never compile an article.
// English is the primary language (CLAUDE.md): write en.mdx first, then zh-TW.

export type Article = {
  slug: string;
  date: string; // published, YYYY-MM-DD
  dataAsOf: string; // the day the text's numbers were read off the site
  locales: Locale[]; // the .mdx files that exist; a missing locale falls back to the first
  title: Partial<Record<Locale, string>>;
  summary: Partial<Record<Locale, string>>;
  // The post announcing this article, where readers discuss it (the site has no
  // comments). Fill in after posting; without one the article links the profile.
  discuss?: { x?: string; instagram?: string };
  // The share card's stat cards (lib/share-card): which season, and 2–3 keys —
  // "record" or a team metric from the 022 views. Values are read from the DB.
  card?: { season: number; stats: CardStatKey[] };
};

export const ARTICLES: Article[] = [
  {
    slug: "2027-outfield-upgrade",
    date: "2026-10-17",
    dataAsOf: "2026-10-17",
    locales: ["en", "zh-TW"],
    card: { season: 2026, stats: ["hr_pct", "iso", "oaa"] },
    title: {
      en: "The Blue Jays' 2027 outfield: free agents, players coming back and the farm",
      "zh-TW": "藍鳥 2027 外野補強：自由市場、傷兵回歸與自家農場",
    },
    summary: {
      en: "The 2026 outfield hit 41 home runs, tied for 29th in MLB. Who on the free-agent market can fix that, who's coming back from injury, what the farm can offer, and why December 1 matters.",
      "zh-TW": "2026 年藍鳥外野只打 41 轟，30 隊並列第 29。自由市場上誰能補上長打、誰會從傷兵名單回來、農場能給什麼，以及為什麼 12/1 是分水嶺。",
    },
  },
  {
    slug: "2026-season-review",
    date: "2026-10-05",
    dataAsOf: "2026-10-05",
    locales: ["en", "zh-TW"],
    card: { season: 2026, stats: ["record", "r_per_g", "ra_per_g"] },
    title: {
      en: "The 2026 Blue Jays: the pitching held up, the bats stopped carrying",
      "zh-TW": "2026 藍鳥賽季分析：投手撐住了，打線卻打不遠了",
    },
    summary: {
      en: "From AL champions to last in the AL East: 150 fewer runs scored, 27 fewer allowed. Where the offense went, what held up, and three questions for 2027.",
      "zh-TW": "從美聯冠軍到分區墊底：少得 150 分、少失 27 分。打線哪裡出了問題、什麼撐住了，以及 2027 年待解的三個問題。",
    },
  },
];

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}

/** The locale an article is shown in: the reader's if that version exists, else its first. */
export function shownLocale(article: Article, locale: string): Locale {
  return article.locales.find((l) => l === locale) ?? article.locales[0];
}
