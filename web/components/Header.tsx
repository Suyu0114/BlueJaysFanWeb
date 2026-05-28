import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";

export function Header() {
  const t = useTranslations("Nav");

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          {t("brand")}
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="hover:underline">
            {t("home")}
          </Link>
          <Link href="/players" className="hover:underline">
            {t("players")}
          </Link>
          <Link href="/about" className="hover:underline">
            {t("about")}
          </Link>
          <LocaleSwitcher />
        </nav>
      </div>
    </header>
  );
}
