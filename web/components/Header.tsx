import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";

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
          <Link href="/" className="transition-colors hover:text-steel">
            {t("home")}
          </Link>
          <Link href="/players" className="transition-colors hover:text-steel">
            {t("players")}
          </Link>
          <Link href="/standings" className="transition-colors hover:text-steel">
            {t("standings")}
          </Link>
          <Link href="/about" className="transition-colors hover:text-steel">
            {t("about")}
          </Link>
          <LocaleSwitcher />
        </nav>
      </div>
    </header>
  );
}
