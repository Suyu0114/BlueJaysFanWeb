import { cache } from "react";
import { sql } from "./db";

// Public article view counts (web_article_views, migration 026). Written only by
// app/api/views/[slug]/route.ts; read here for the article header and the list
// cards. A slug with no row has 0 views.

/**
 * Below this a count stays hidden: "12 views" on a new article reads as "nobody
 * reads this". Change it here; nothing else knows the threshold.
 */
export const MIN_PUBLIC_VIEWS = 50;

/** slug -> views, every article in one query. React cache() dedupes it per request. */
export const getArticleViews = cache(async (): Promise<Map<string, number>> => {
  const rows = await sql<{ slug: string; views: number }[]>`
    select slug, views::int as views from web_article_views
  `;
  return new Map(rows.map((r) => [r.slug, r.views]));
});

/** The count to show, or null while it's under MIN_PUBLIC_VIEWS. */
export function publicViews(views: Map<string, number>, slug: string): number | null {
  const n = views.get(slug) ?? 0;
  return n >= MIN_PUBLIC_VIEWS ? n : null;
}
