import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { ARTICLES, getArticle, shownLocale } from "@/content/articles";
import { routing } from "@/i18n/routing";
import { capLogo, loadGoogleFont, OG, OG_SIZE, ogFonts } from "@/lib/og";
import { SITE, siteHost } from "@/lib/site";

// The article's share card (X / Instagram / LINE link previews): the site's
// parchment and ink, the title in the reader's language, byline + date. Fonts
// are subset from Google Fonts per image (lib/og.ts); if the Chinese face can't
// be fetched the card falls back to the English title rather than drawing boxes.

export const size = OG_SIZE;
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
  let lang = article ? shownLocale(article, locale) : "en";
  const wordmark = SITE.name.toUpperCase();

  const text = async (l: string) => {
    const t = await getTranslations({ locale: l, namespace: "Articles" });
    const date = article
      ? new Intl.DateTimeFormat(l, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${article.date}T00:00:00Z`))
      : "";
    return {
      title: article?.title[l as keyof typeof article.title] ?? article?.title.en ?? SITE.name,
      meta: [t("byline", { author: SITE.author }), date].filter(Boolean).join(" · "),
    };
  };

  let copy = await text(lang);
  const glyphs = (c: { title: string; meta: string }) => `${c.title}${c.meta}${siteHost()}`;
  const [graduate, logo] = await Promise.all([loadGoogleFont("Graduate", 400, wordmark), capLogo()]);
  let body =
    lang === "zh-TW" ? await loadGoogleFont("Noto Serif TC", 700, glyphs(copy)) : await loadGoogleFont("Gabriela", 400, glyphs(copy));
  if (lang === "zh-TW" && !body) {
    lang = "en";
    copy = await text("en");
    body = await loadGoogleFont("Gabriela", 400, glyphs(copy));
  }
  const bodyFamily = lang === "zh-TW" ? "Noto Serif TC" : "Gabriela";
  const titleSize = copy.title.length > 60 ? 54 : 64;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: OG.papaya, padding: 28 }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            border: `3px solid ${OG.navy}`,
            borderRadius: 10,
            padding: "40px 56px 36px",
            boxShadow: `8px 8px 0 0 rgba(0, 48, 73, 0.2)`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontFamily: "Graduate", fontSize: 34, letterSpacing: 2, color: OG.navy }}>{wordmark}</div>
            {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img> */}
            <img src={logo} width={88} height={88} alt="" />
          </div>
          <div style={{ width: 140, height: 5, background: OG.brick, marginTop: 14 }} />
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              fontFamily: bodyFamily,
              fontSize: titleSize,
              lineHeight: 1.22,
              color: OG.navy,
            }}
          >
            {copy.title}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: bodyFamily,
              fontSize: 26,
              color: OG.navy,
            }}
          >
            <span style={{ opacity: 0.75 }}>{copy.meta}</span>
            <span style={{ color: OG.steel }}>{siteHost()}</span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: ogFonts([
        { name: "Graduate", data: graduate, weight: 400 },
        { name: bodyFamily, data: body, weight: lang === "zh-TW" ? 700 : 400 },
      ]),
    },
  );
}
