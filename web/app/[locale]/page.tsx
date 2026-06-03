import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import ScheduleCalendar from "@/components/ScheduleCalendar";
import { getSchedule, type ScheduleGame } from "@/lib/games";
import {
  formatInningsPitched,
  getBestPitchingLine,
  getHardestContact,
  getHomeRunHero,
  getMostRecentGame,
} from "@/lib/recent-game";

export const revalidate = 3600;

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

  const recent = await getMostRecentGame();
  const [hrHero, pitchingLine] = recent
    ? await Promise.all([
        getHomeRunHero(recent.game_pk),
        getBestPitchingLine(recent.game_pk),
      ])
    : [null, null];
  const contact = recent && !hrHero ? await getHardestContact(recent.game_pk) : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      {recent && (hrHero || contact || pitchingLine) && (
        <section>
          <h2 className="text-lg font-semibold text-navy">
            {t("todayTitle")}
          </h2>
          <p className="mt-0.5 text-xs text-navy/55">
            {t("fromGame", { date: recent.game_date })}
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {hrHero ? (
              <HeroCard
                href={`/players/${hrHero.mlbam_id}`}
                headshot={hrHero.headshot_url}
                name={hrHero.name}
                headline={t("hrHero", { name: hrHero.name, n: hrHero.hr_count })}
              />
            ) : contact ? (
              <HeroCard
                href={`/players/${contact.mlbam_id}`}
                headshot={contact.headshot_url}
                name={contact.name}
                headline={t("hardestContact", {
                  name: contact.name,
                  mph: contact.launch_speed.toFixed(1),
                })}
              />
            ) : null}

            {pitchingLine && (
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
            )}
          </div>
        </section>
      )}

      {games.length > 0 && (
        <ScheduleCalendar
          games={games}
          highlightDate={highlightDate}
          season={season}
        />
      )}
    </div>
  );
}

function HeroCard({
  href,
  headshot,
  name,
  headline,
}: {
  href: string;
  headshot: string | null;
  name: string;
  headline: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-brick/20 bg-white/70 p-4 transition-shadow hover:border-brick hover:shadow-md"
    >
      {headshot && (
        <Image
          src={headshot}
          alt={name}
          width={56}
          height={56}
          unoptimized
          className="rounded-full bg-papaya"
        />
      )}
      <p className="text-sm font-medium leading-snug text-navy">{headline}</p>
    </Link>
  );
}
