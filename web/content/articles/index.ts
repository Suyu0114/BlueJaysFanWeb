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
  // The clubs the article is about (MLB team ids), for an article on other
  // clubs: their cap logos over the title, on the list card and the share card.
  teams?: number[];
};

export const ARTICLES: Article[] = [
  {
    slug: "2026-world-series-preview",
    date: "2026-10-22",
    dataAsOf: "2026-10-22",
    locales: ["en", "zh-TW"],
    // No `card`: the share card's stats are Blue Jays numbers, so this one shows the title + the two logos.
    teams: [158, 139],
    title: {
      en: "2026 World Series preview: Brewers vs. Rays",
      "zh-TW": "2026 世界大賽賽前預測：Brewers vs Rays",
    },
    summary: {
      en: "Two clubs chasing a first title. The Brewers won 103 games by getting on base and leaning on a lockdown bullpen; the Rays won 98 by not striking out and not walking anyone, eight more than their run differential predicts. How they match up, and my pick.",
      "zh-TW": "兩支都還沒拿過冠軍的球隊。Brewers 靠上壘和鐵牛棚拿下 103 勝；Rays 靠不被三振、不投保送贏了 98 場，比得失分預期多 8 勝。兩隊怎麼對上，以及我的預測。",
    },
  },
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
