import type { Metadata } from "next";
import { Gabriela, Graduate } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SketchDefs } from "@/components/SketchDefs";
import MotionProvider from "@/components/motion/MotionProvider";
import { SITE } from "@/lib/site";
import "../globals.css";

// Body / UI / data face (Gabriela has a single 400 style — no Sans/Mono variants).
const gabriela = Gabriela({
  weight: "400",
  variable: "--font-gabriela",
  subsets: ["latin"],
  display: "swap",
});
// Retro varsity display face — heading layer (nav brand, section titles, calendar chrome).
const graduate = Graduate({
  weight: "400",
  variable: "--font-graduate",
  subsets: ["latin"],
  display: "swap",
});

const DESCRIPTION = `Toronto Blue Jays data visualizations and player pages, by ${SITE.author}.`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: SITE.name, template: `%s · ${SITE.name}` },
  description: DESCRIPTION,
  applicationName: SITE.name,
  authors: [{ name: SITE.author, url: SITE.links.linkedin }],
  creator: SITE.author,
  openGraph: { type: "website", siteName: SITE.name, title: SITE.name, description: DESCRIPTION },
  // Tab icon: the recoloured Jays cap mark from etl/fetch_team_logos.py (navy
  // ink on papaya paper), reusing the same asset the standings tables render.
  // The stock create-next-app app/favicon.ico was removed — left in place it
  // would still be auto-served at /favicon.ico and compete with this one.
  icons: { icon: [{ url: "/team-logos/141.svg", type: "image/svg+xml" }] },
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      className={`${gabriela.variable} ${graduate.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-papaya text-navy">
        {/* Reveal SSRs its hidden start state (opacity 0); without JS nothing
            would ever animate it in, so force those elements visible. Tab
            panels hidden by class (data-tabpanel) and their no-JS headings
            (data-nojs-label) show too, since the tabs can't switch. */}
        <noscript>
          <style>{`[data-reveal]{opacity:1!important;transform:none!important}.anim-paused *{animation:none!important}[data-tabpanel],[data-nojs-label]{display:block!important}`}</style>
        </noscript>
        <NextIntlClientProvider>
          <MotionProvider>
            <SketchDefs />
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </MotionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
