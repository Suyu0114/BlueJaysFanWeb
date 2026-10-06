import type { Locale } from "@/i18n/routing";

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
};

export const ARTICLES: Article[] = [
  {
    slug: "2026-season-review",
    date: "2026-10-05",
    dataAsOf: "2026-10-05",
    locales: ["en", "zh-TW"],
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
