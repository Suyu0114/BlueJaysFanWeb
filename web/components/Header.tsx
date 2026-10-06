import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { getTeamSeasons } from "@/lib/team-season-data";
import { getTrendSeasons } from "@/lib/team-trends";
import { SITE } from "@/lib/site";
import { LocaleSwitcher } from "./LocaleSwitcher";
import MobileMenu from "./MobileMenu";
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
      {/* md+: brand + inline links + language pill (wraps under the brand if
          it runs out of room). Below md: one row — brand, pill, ☰ — and the
          links move into MobileMenu. Labels never break mid-word. */}
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 md:gap-x-4">
        <Link
          href="/"
          className="whitespace-nowrap font-display text-lg uppercase tracking-wide"
        >
          {SITE.name}
        </Link>
        <div className="flex items-center gap-x-2 md:gap-x-4">
          <nav className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-sm md:flex">
            {NAV_ITEMS.map((item) =>
              item.href == null ? (
                <TeamMenu key={item.key} seasons={seasons} trendSpan={trendSpan} linkClass={NAV_LINK} />
              ) : (
                <Link key={item.key} href={item.href} className={NAV_LINK}>
                  {t(item.key)}
                </Link>
              ),
            )}
          </nav>
          <LocaleSwitcher />
          <MobileMenu seasons={seasons} trendSpan={trendSpan} className="md:hidden" />
        </div>
      </div>
    </header>
  );
}
