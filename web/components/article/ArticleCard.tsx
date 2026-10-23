import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import ScorecardFrame from "@/components/ScorecardFrame";
import ClubMatchup from "@/components/article/ClubMatchup";
import { shownLocale, type Article } from "@/content/articles";

// One article's hand-drawn card: date (+ language when the reader's isn't
// available, + public view count), the clubs' logos, title, summary, "Read".
// The article list shows every article (title = h2 under the page h1); the home
// page shows the newest three (h3 under its "Latest articles" h2, `compact`:
// smaller title, summary clamped so a row of three stays level).

export default async function ArticleCard({
  article,
  locale,
  views,
  heading = "h2",
  compact = false,
}: {
  article: Article;
  locale: string;
  views: number | null;
  heading?: "h2" | "h3";
  compact?: boolean;
}) {
  const t = await getTranslations("Articles");
  const shown = shownLocale(article, locale);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${article.date}T00:00:00Z`),
  );
  const Heading = heading;

  return (
    <ScorecardFrame seedKey={`article-${article.slug}`} className={compact ? "h-full" : undefined}>
      <Link
        href={`/articles/${article.slug}`}
        className={`relative z-10 p-5 ${compact ? "flex h-full flex-col" : "block"}`}
      >
        <div className="flex items-center justify-between gap-3">
          <time dateTime={article.date} className="text-xs text-navy/55">
            {date}
            {shown !== locale && ` · ${t(`languageNames.${shown}`)}`}
            {views != null && ` · ${t("views", { count: views })}`}
          </time>
          {article.teams && <ClubMatchup teams={article.teams} size={28} />}
        </div>
        <Heading
          className={`mt-1 font-semibold leading-snug text-navy ${compact ? "text-lg" : "text-xl"}`}
          lang={shown}
        >
          {article.title[shown]}
        </Heading>
        <p className={`mt-2 text-sm leading-relaxed text-navy/70 ${compact ? "line-clamp-3" : ""}`} lang={shown}>
          {article.summary[shown]}
        </p>
        <span className={`inline-block text-sm text-brick ${compact ? "mt-auto pt-3" : "mt-3"}`}>{t("read")}</span>
      </Link>
    </ScorecardFrame>
  );
}
