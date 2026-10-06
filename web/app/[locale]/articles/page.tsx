import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import ScorecardFrame from "@/components/ScorecardFrame";
import { Reveal } from "@/components/motion/Reveal";
import { ARTICLES, shownLocale } from "@/content/articles";
import { getArticleViews, publicViews } from "@/lib/article-views";
import { SITE } from "@/lib/site";

// The article list: one hand-drawn card per article (content/articles/index.ts,
// newest first). An article without a version in the reader's language is
// listed in the language it has, labelled. View counts (once past
// MIN_PUBLIC_VIEWS) refresh hourly, and on the nightly cron's revalidate.

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Articles" });
  return { title: t("title") };
}

export default async function ArticlesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Articles");
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" });
  const views = await getArticleViews();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Reveal>
        <h1 className="font-display text-2xl uppercase tracking-wide text-navy">{t("title")}</h1>
        <p className="mt-1 text-sm text-navy/60">{t("lede", { author: SITE.author })}</p>
      </Reveal>

      {ARTICLES.length === 0 ? (
        <p className="mt-8 text-navy/55">{t("empty")}</p>
      ) : (
        <ul className="mt-8 space-y-6">
          {ARTICLES.map((a) => {
            const shown = shownLocale(a, locale);
            const count = publicViews(views, a.slug);
            return (
              <Reveal as="li" key={a.slug}>
                <ScorecardFrame seedKey={`article-${a.slug}`}>
                  <Link href={`/articles/${a.slug}`} className="relative z-10 block p-5">
                    <time dateTime={a.date} className="text-xs text-navy/55">
                      {dateFmt.format(new Date(`${a.date}T00:00:00Z`))}
                      {shown !== locale && ` · ${t(`languageNames.${shown}`)}`}
                      {count != null && ` · ${t("views", { count })}`}
                    </time>
                    <h2 className="mt-1 text-xl font-semibold leading-snug text-navy" lang={shown}>
                      {a.title[shown]}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-navy/70" lang={shown}>
                      {a.summary[shown]}
                    </p>
                    <span className="mt-3 inline-block text-sm text-brick">{t("read")}</span>
                  </Link>
                </ScorecardFrame>
              </Reveal>
            );
          })}
        </ul>
      )}
    </div>
  );
}
