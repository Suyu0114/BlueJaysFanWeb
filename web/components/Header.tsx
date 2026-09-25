import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";

// Nav links: a steel rule draws in from the left on hover (scale-x on ::after),
// alongside the colour shift — slow enough to read as a stroke, not a blink.
const NAV_LINK =
  "relative transition-colors hover:text-steel after:absolute after:inset-x-0 after:-bottom-1 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-steel after:transition-transform after:duration-500 hover:after:scale-x-100";

export function Header() {
  const t = useTranslations("Nav");

  return (
    <header className="border-b-2 border-brick bg-navy text-papaya">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link
          href="/"
          className="font-display text-lg uppercase tracking-wide"
        >
          {t("brand")}
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className={NAV_LINK}>
            {t("home")}
          </Link>
          <Link href="/players" className={NAV_LINK}>
            {t("players")}
          </Link>
          <Link href="/standings" className={NAV_LINK}>
            {t("standings")}
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
