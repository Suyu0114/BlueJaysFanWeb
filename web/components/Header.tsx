import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";

// Nav links: a steel rule draws in from the left on hover (scale-x on ::after),
// alongside the colour shift — slow enough to read as a stroke, not a blink.
const NAV_LINK =
  "relative whitespace-nowrap transition-colors hover:text-steel after:absolute after:inset-x-0 after:-bottom-1 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-steel after:transition-transform after:duration-500 hover:after:scale-x-100";

export async function Header() {
  const t = await getTranslations("Nav");
  // "Team" -> the P13 five-season team page. P12 shipped this link pointing at
  // the newest /season/[year]; P13 kept its key, label and position and only
  // changed the href. Single seasons are reached from the /team season strip.

  return (
    <header className="border-b-2 border-brick bg-navy text-papaya">
      {/* Wraps to two rows at phone width (brand, then the links) instead of
          overflowing; labels never break mid-word (zh-TW would stack them). */}
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <Link
          href="/"
          className="whitespace-nowrap font-display text-lg uppercase tracking-wide"
        >
          {t("brand")}
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
          <Link href="/team" className={NAV_LINK}>
            {t("team")}
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
