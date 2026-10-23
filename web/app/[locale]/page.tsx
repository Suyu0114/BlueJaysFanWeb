import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import ArticleCard from "@/components/article/ArticleCard";
import HeroCard from "@/components/HeroCard";
import HomeStandings from "@/components/HomeStandings";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/Reveal";
import ScheduleCalendar from "@/components/ScheduleCalendar";
import { ARTICLES } from "@/content/articles";
import { getArticleViews, publicViews } from "@/lib/article-views";
import { getSchedule, type ScheduleGame } from "@/lib/games";
import { getStandings } from "@/lib/standings";
import {
  formatInningsPitched,
  getBestPitchingLine,
  getHardestContact,
  getHomeRunHero,
  getMostRecentGame,
} from "@/lib/recent-game";
import { localeAlternates } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const revalidate = 3600;

// The home page is the one search engines weigh most: its own title (brand +
// club), the subtitle as the description, and its translation linked.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Home" });
  return {
    title: { absolute: t("title") },
    description: t("subtitle"),
    alternates: localeAlternates(locale),
  };
}

// The current / most-recent game day to highlight: the latest game on or before
// today, else the season's first game (before opening day).
function pickHighlightDate(
  games: ScheduleGame[],
  today: string,
): string | null {
  let latestPast: string | null = null;
  let earliest: string | null = null;
  for (const g of games) {
    if (earliest === null || g.game_date < earliest) earliest = g.game_date;
    if (g.game_date <= today && (latestPast === null || g.game_date > latestPast)) {
      latestPast = g.game_date;
    }
  }
  return latestPast ?? earliest;
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");

  // Schedule calendar: current season, falling back to last season in the
  // offseason (before the new schedule is published).
  const todayET = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  let season = Number(todayET.slice(0, 4));
  let games = await getSchedule(season);
  if (games.length === 0) {
    season -= 1;
    games = await getSchedule(season);
  }
  const highlightDate = pickHighlightDate(games, todayET);

  const [standings, recent] = await Promise.all([
    getStandings(season),
    getMostRecentGame(),
  ]);
  const [hrHero, pitchingLine] = recent
    ? await Promise.all([
        getHomeRunHero(recent.game_pk),
        getBestPitchingLine(recent.game_pk),
      ])
    : [null, null];
  const contact = recent && !hrHero ? await getHardestContact(recent.game_pk) : null;
  const latest = ARTICLES.slice(0, 3); // the registry is newest first
  const views = latest.length > 0 ? await getArticleViews() : new Map<string, number>();

  // schema.org WebSite: the name Google shows for the site in results, tied to
  // the author (the About page's Person).
  const webSite = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    alternateName: ["Suyu Jays Notes"],
    url: `${SITE.url}/`,
    inLanguage: locale,
    author: {
      "@type": "Person",
      name: SITE.author,
      url: `${SITE.url}/${locale}/about`,
      sameAs: [SITE.links.linkedin, SITE.links.portfolio, SITE.links.x, SITE.links.instagram].filter(Boolean),
    },
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webSite).replace(/</g, "\\u003c") }}
      />
      <Reveal>
        <h1 className="font-display text-3xl uppercase tracking-wide text-navy">{SITE.name}</h1>
        <p className="mt-1 text-sm text-navy/60">{t("subtitle")}</p>
      </Reveal>

      {latest.length > 0 && (
        <section className="mt-8">
          <Reveal className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-xl uppercase tracking-wide text-navy">
              {t("latestArticles")}
            </h2>
            <Link
              href="/articles"
              className="shrink-0 text-sm text-brick transition-colors hover:text-lava"
            >
              {t("allArticles")}
            </Link>
          </Reveal>
          <RevealGroup className="mt-4 grid gap-4 md:grid-cols-3">
            {latest.map((a) => (
              <RevealItem key={a.slug} className="h-full">
                <ArticleCard
                  article={a}
                  locale={locale}
                  views={publicViews(views, a.slug)}
                  heading="h3"
                  compact
                />
              </RevealItem>
            ))}
          </RevealGroup>
        </section>
      )}

      {recent && (hrHero || contact || pitchingLine) && (
        <section className="mt-8">
          <Reveal>
            <h2 className="font-display text-xl uppercase tracking-wide text-navy">
              {t("todayTitle")}
            </h2>
            <p className="mt-0.5 text-xs text-navy/55">
              {t("fromGame", { date: recent.game_date })}
            </p>
          </Reveal>
          <RevealGroup className="mt-4 grid gap-4 sm:grid-cols-2">
            {hrHero ? (
              <RevealItem>
                <HeroCard
                  href={`/players/${hrHero.mlbam_id}`}
                  headshot={hrHero.headshot_url}
                  name={hrHero.name}
                  headline={t("hrHero", { name: hrHero.name, n: hrHero.hr_count })}
                />
              </RevealItem>
            ) : contact ? (
              <RevealItem>
                <HeroCard
                  href={`/players/${contact.mlbam_id}`}
                  headshot={contact.headshot_url}
                  name={contact.name}
                  headline={t("hardestContact", {
                    name: contact.name,
                    mph: contact.launch_speed.toFixed(1),
                  })}
                />
              </RevealItem>
            ) : null}

            {pitchingLine && (
              <RevealItem>
                <HeroCard
                  href={`/players/${pitchingLine.mlbam_id}`}
                  headshot={pitchingLine.headshot_url}
                  name={pitchingLine.name}
                  headline={t("bestPitching", {
                    name: pitchingLine.name,
                    ip: formatInningsPitched(pitchingLine.outs),
                    k: pitchingLine.ks,
                    h: pitchingLine.hits,
                  })}
                />
              </RevealItem>
            )}
          </RevealGroup>
        </section>
      )}

      <HomeStandings rows={standings} />

      {games.length > 0 && (
        <Reveal>
          <ScheduleCalendar
            games={games}
            highlightDate={highlightDate}
            season={season}
          />
        </Reveal>
      )}
    </div>
  );
}

