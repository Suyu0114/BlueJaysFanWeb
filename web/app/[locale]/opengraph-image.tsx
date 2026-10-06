import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { capLogo, loadGoogleFont, OG, OG_SIZE, ogFonts } from "@/lib/og";
import { SITE, siteHost } from "@/lib/site";

// The site's default share card, used by every page without its own (articles
// have one): wordmark, the Jays cap, the site's one-line description in the
// reader's language. Same palette and font loading as the article card.

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = SITE.name;

// Prerendered per locale at build, like the article cards.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const wordmark = SITE.name.toUpperCase();
  let tagline = (await getTranslations({ locale, namespace: "Home" }))("subtitle");
  const zh = locale === "zh-TW";

  const [graduate, logo] = await Promise.all([loadGoogleFont("Graduate", 400, wordmark), capLogo()]);
  let body = await loadGoogleFont(zh ? "Noto Serif TC" : "Gabriela", zh ? 700 : 400, `${tagline}${siteHost()}`);
  let family = zh ? "Noto Serif TC" : "Gabriela";
  if (zh && !body) {
    tagline = (await getTranslations({ locale: "en", namespace: "Home" }))("subtitle");
    body = await loadGoogleFont("Gabriela", 400, `${tagline}${siteHost()}`);
    family = "Gabriela";
  }

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: OG.papaya, padding: 28 }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            border: `3px solid ${OG.navy}`,
            borderRadius: 10,
            padding: "40px 64px",
            boxShadow: `8px 8px 0 0 rgba(0, 48, 73, 0.2)`,
          }}
        >
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: "Graduate", fontSize: 76, lineHeight: 1.05, letterSpacing: 2, color: OG.navy }}>
              {wordmark}
            </div>
            <div style={{ width: 160, height: 6, background: OG.brick, marginTop: 22 }} />
            <div style={{ fontFamily: family, fontSize: 32, lineHeight: 1.3, color: OG.navy, marginTop: 26, maxWidth: 740 }}>
              {tagline}
            </div>
            <div style={{ fontFamily: family, fontSize: 26, color: OG.steel, marginTop: 30 }}>{siteHost()}</div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img> */}
          <img src={logo} width={260} height={260} alt="" />
        </div>
      </div>
    ),
    {
      ...size,
      fonts: ogFonts([
        { name: "Graduate", data: graduate, weight: 400 },
        { name: family, data: body, weight: family === "Noto Serif TC" ? 700 : 400 },
      ]),
    },
  );
}
