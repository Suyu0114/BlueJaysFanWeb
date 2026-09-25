import { getTranslations, setRequestLocale } from "next-intl/server";
import HeroCard from "@/components/HeroCard";
import HomeStandings from "@/components/HomeStandings";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/Reveal";
import ScheduleCalendar from "@/components/ScheduleCalendar";
import { getSchedule, type ScheduleGame } from "@/lib/games";
import { getStandings } from "@/lib/standings";
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      {recent && (hrHero || contact || pitchingLine) && (
        <section>
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

