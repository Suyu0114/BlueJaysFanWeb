import type { MetadataRoute } from "next";
import { ARTICLES } from "@/content/articles";
import { routing } from "@/i18n/routing";
import { getRosterAllTime } from "@/lib/players";
import { getTeamSeasons } from "@/lib/team-season-data";
import { SITE } from "@/lib/site";

// /sitemap.xml for search engines: every page in both languages, each entry
// listing its translation (hreflang). Players = everyone on the 2024–2026
// all-time roster; seasons = every season page; articles = the registry.
// Lives outside [locale]; proxy.ts already skips paths with an extension.

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [seasons, players] = await Promise.all([getTeamSeasons(), getRosterAllTime()]);
  const entries = (path: string, extra: Partial<MetadataRoute.Sitemap[number]> = {}) =>
    routing.locales.map((locale) => ({
      url: `${SITE.url}/${locale}${path}`,
      alternates: { languages: Object.fromEntries(routing.locales.map((l) => [l, `${SITE.url}/${l}${path}`])) },
      ...extra,
    }));

  return [
    ...["", "/players", "/standings", "/team", "/articles", "/about"].flatMap((p) => entries(p)),
    ...ARTICLES.flatMap((a) => entries(`/articles/${a.slug}`, { lastModified: a.date })),
    ...seasons.flatMap((s) => entries(`/season/${s}`)),
    ...players.flatMap((p) => entries(`/players/${p.mlbam_id}`)),
  ];
}
