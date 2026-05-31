import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  formatInningsPitched,
  getBestPitchingLine,
  getHardestContact,
  getHomeRunHero,
  getMostRecentGame,
} from "@/lib/recent-game";

export const revalidate = 3600;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");

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
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {t("title")}
      </h1>
      <p className="mt-4 max-w-prose text-lg text-navy/70">{t("subtitle")}</p>
      <Link
        href="/players"
        className="mt-6 inline-flex items-center rounded-full bg-brick px-5 py-2.5 text-sm font-medium text-papaya transition-colors hover:bg-lava"
      >
        {t("viewRoster")}
      </Link>

      {recent && (hrHero || contact || pitchingLine) && (
        <section className="mt-10">
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
