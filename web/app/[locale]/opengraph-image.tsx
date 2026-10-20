import { routing } from "@/i18n/routing";
import { CARD_SIZES, renderSiteCard } from "@/lib/share-card/card";
import { SITE } from "@/lib/site";

// The site's default share card, used by every page without its own (articles
// have one): wordmark, the site logo and the site's one-line description in the
// reader's language, on the share cards' parchment and hand-drawn frame.

export const size = CARD_SIZES.og;
export const contentType = "image/png";
export const alt = SITE.name;

// Prerendered per locale at build, like the article cards.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return renderSiteCard(locale);
}
