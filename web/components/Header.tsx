import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getTeamSeasons } from "@/lib/team-season-data";
import { getTrendSeasons } from "@/lib/team-trends";
import { SITE } from "@/lib/site";
import { LocaleSwitcher } from "./LocaleSwitcher";
import TeamMenu from "./TeamMenu";

// Nav links: a steel rule draws in from the left on hover (scale-x on ::after),
// alongside the colour shift — slow enough to read as a stroke, not a blink.
const NAV_LINK =
  "relative whitespace-nowrap transition-colors hover:text-steel after:absolute after:inset-x-0 after:-bottom-1 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-steel after:transition-transform after:duration-500 hover:after:scale-x-100";

export async function Header() {
  const t = await getTranslations("Nav");
  // "Team ▾" opens the team section's two views: one season's review
  // (/season/[year], P12; newest first, same resolver as the season page's
  // switcher) and the five-season trends (/team, P13). Both pages also carry
  // TeamNav tabs, so switching never needs this menu.
  const [seasons, trendSeasons] = await Promise.all([getTeamSeasons(), getTrendSeasons()]);
  const trendSpan =
    trendSeasons.length > 0 ? { from: trendSeasons[0], to: trendSeasons[trendSeasons.length - 1] } : null;

  return (
    <header className="relative z-40 border-b-2 border-brick bg-navy text-papaya">
      {/* Wraps to two rows at phone width (brand, then the links) instead of
          overflowing; labels never break mid-word (zh-TW would stack them). */}
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <Link
          href="/"
          className="whitespace-nowrap font-display text-lg uppercase tracking-wide"
        >
          {SITE.name}
        </Link>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Link href="/" className={NAV_LINK}>
            {t("home")}
          </Link>
          <Link href="/players" className={NAV_LINK}>
            {t("players")}
          </Link>
          <Link href="/standings" className={NAV_LINK}>
            {t("standings")}
          </Link>
          <TeamMenu seasons={seasons} trendSpan={trendSpan} linkClass={NAV_LINK} />
          <Link href="/articles" className={NAV_LINK}>
            {t("articles")}
          </Link>
          <Link href="/about" className={NAV_LINK}>
            {t("about")}
          </Link>
          <LocaleSwitcher />
        </nav>
      </div>
    </header>
  );
}
