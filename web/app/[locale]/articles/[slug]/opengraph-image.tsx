import { ARTICLES, getArticle, shownLocale } from "@/content/articles";
import { routing } from "@/i18n/routing";
import { CARD_SIZES, renderShareCard, renderSiteCard } from "@/lib/share-card/card";
import { loadCardSpec } from "@/lib/share-card/spec";
import { SITE } from "@/lib/site";

// The article's share card (X / LINE / Facebook link previews): the site's
// hand-drawn scorecard with the title in the reader's language and the
// registry's `card` stats read from the DB (lib/share-card). If the Chinese
// face can't be fetched the card falls back to English rather than boxes.

export const size = CARD_SIZES.og;
export const contentType = "image/png";
export const alt = `${SITE.name} — article`;

// Prerender one card per article per locale at build. An image route gets no
// params from the [locale] layout or the page, so it lists both itself (without
// this it rendered per request, fetching fonts every time).
export function generateStaticParams() {
  return routing.locales.flatMap((locale) => ARTICLES.map((a) => ({ locale, slug: a.slug })));
}

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const article = getArticle(slug);
  const spec = article ? await loadCardSpec("article", slug) : null;
  if (!article || !spec) return renderSiteCard(locale);
  return renderShareCard(spec, { size: "og", locale: shownLocale(article, locale) });
}
