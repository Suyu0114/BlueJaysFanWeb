import type { Metadata } from "next";
import { Gabriela, Graduate } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { Header } from "@/components/Header";
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

export const metadata: Metadata = {
  title: "Blue Jays Fan Hub",
  description:
    "Data visualizations and player pages for Toronto Blue Jays fans.",
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
        <NextIntlClientProvider>
          <Header />
          <main className="flex-1">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
