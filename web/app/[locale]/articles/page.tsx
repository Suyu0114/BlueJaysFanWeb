import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import ArticleCard from "@/components/article/ArticleCard";
import { Reveal } from "@/components/motion/Reveal";
import { ARTICLES } from "@/content/articles";
import { getArticleViews, publicViews } from "@/lib/article-views";
import { localeAlternates } from "@/lib/seo";
import { SITE } from "@/lib/site";

// The article list: one hand-drawn card per article (content/articles/index.ts,
// newest first; components/article/ArticleCard, shared with the home page). An
// article without a version in the reader's language is listed in the language
// it has, labelled. View counts (once past MIN_PUBLIC_VIEWS) refresh hourly,
// and on the nightly cron's revalidate.

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Articles" });
  return {
    title: t("title"),
    description: t("lede", { author: SITE.author }),
    alternates: localeAlternates(locale, "/articles"),
  };
}

export default async function ArticlesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Articles");
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
          {ARTICLES.map((a) => (
            <Reveal as="li" key={a.slug}>
              <ArticleCard article={a} locale={locale} views={publicViews(views, a.slug)} />
            </Reveal>
          ))}
        </ul>
      )}
    </div>
  );
}
