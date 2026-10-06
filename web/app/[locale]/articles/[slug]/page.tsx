import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Reveal } from "@/components/motion/Reveal";
import ArticleEnd from "@/components/article/ArticleEnd";
import ViewPing from "@/components/article/ViewPing";
import { ARTICLES, getArticle, shownLocale } from "@/content/articles";
import { routing } from "@/i18n/routing";
import { getArticleViews, publicViews } from "@/lib/article-views";
import { SITE } from "@/lib/site";

// One article: content/articles/<slug>/<locale>.mdx, rendered with the site
// typography and figure components from mdx-components.tsx. The figures read
// live data (components/article/figures.tsx), so the page revalidates like the
// season page; the text's own numbers are dated by `dataAsOf`. A locale without
// its own .mdx shows the article's first locale, with a notice. The view count
// (lib/article-views.ts) shows once it passes MIN_PUBLIC_VIEWS; ViewPing counts
// the visit. The share image is ./opengraph-image.tsx.

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

type Params = Promise<{ locale: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  const article = getArticle(slug);
  if (!article) return {};
  const shown = shownLocale(article, locale);
  const title = article.title[shown];
  const description = article.summary[shown];
  return {
    title,
    description,
    authors: [{ name: SITE.author, url: SITE.links.linkedin }],
    // One URL per language, so search engines index both and link them as translations.
    alternates: {
      canonical: `/${locale}/articles/${slug}`,
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}/articles/${slug}`])),
    },
    openGraph: {
      type: "article",
      title,
      description,
      url: `/${locale}/articles/${slug}`,
      publishedTime: article.date,
      authors: [SITE.author],
    },
  };
}

export default async function ArticlePage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const article = getArticle(slug);
  if (!article) notFound();
  const shown = shownLocale(article, locale);
  const { default: Body } = await import(`@/content/articles/${slug}/${shown}.mdx`);

  const t = await getTranslations("Articles");
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" });
  const day = (ymd: string) => dateFmt.format(new Date(`${ymd}T00:00:00Z`));
  const title = article.title[shown] ?? slug;
  const views = publicViews(await getArticleViews(), slug);
  const url = `${SITE.url}/${locale}/articles/${slug}`;

  // schema.org Article: headline, dates and the author (the About page's Person).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description: article.summary[shown],
    datePublished: article.date,
    inLanguage: shown,
    url: `${SITE.url}/${locale}/articles/${slug}`,
    author: { "@type": "Person", name: SITE.author, url: `${SITE.url}/${locale}/about` },
    publisher: { "@type": "Organization", name: SITE.name, url: SITE.url },
  };

  return (
    <article className="mx-auto max-w-3xl px-4 py-10" lang={shown}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Link href="/articles" className="text-sm text-navy/60 transition-colors hover:text-brick" lang={locale}>
        {t("back")}
      </Link>
      <Reveal as="section" className="mt-4">
        <h1 className="text-3xl font-semibold leading-tight text-navy">{title}</h1>
        <p className="mt-3 text-sm text-navy/65" lang={locale}>
          {t("byline", { author: SITE.author })} · <time dateTime={article.date}>{day(article.date)}</time>
          {views != null && <> · {t("views", { count: views })}</>}
        </p>
        <p className="mt-1 text-xs leading-snug text-navy/50" lang={locale}>
          {t("dataAsOf", { date: day(article.dataAsOf) })}
        </p>
        {shown !== locale && (
          <p className="mt-3 rounded-md border border-steel/40 bg-steel/10 px-3 py-2 text-sm text-navy/75" lang={locale}>
            {t("otherLocale", { language: t(`languageNames.${shown}`) })}
          </p>
        )}
      </Reveal>

      <div className="mt-8 border-t border-navy/15 pt-2 text-[17px]">
        <Body />
      </div>

      <div lang={locale}>
        <ArticleEnd article={article} url={url} title={title} />
      </div>
      <ViewPing slug={slug} />

      <div className="mt-8 border-t border-navy/15 pt-4">
        <Link href="/articles" className="text-sm text-navy/60 transition-colors hover:text-brick" lang={locale}>
          {t("back")}
        </Link>
      </div>
    </article>
  );
}
