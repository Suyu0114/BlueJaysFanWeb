import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SITE } from "@/lib/site";

// Site-wide credit + contact strip, bookending the header (navy, brick rule).
// Readers who arrive on a shared chart land deep in the site and rarely open
// About, so who made it and how to reach them lives on every page. Static on
// purpose: the layout renders it everywhere, so it must never query the DB.

const LINK =
  "whitespace-nowrap underline-offset-4 transition-colors hover:text-steel hover:underline";

export async function Footer() {
  const t = await getTranslations("Footer");
  const external = [
    { href: SITE.links.linkedin, label: t("linkedin") },
    { href: SITE.links.portfolio, label: t("portfolio") },
    ...(SITE.links.x ? [{ href: SITE.links.x, label: t("x") }] : []),
    ...(SITE.links.instagram ? [{ href: SITE.links.instagram, label: t("instagram") }] : []),
  ];

  return (
    <footer aria-label={t("label")} className="border-t-2 border-brick bg-navy text-papaya">
      <div className="mx-auto max-w-5xl px-4 py-5 text-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/" className="whitespace-nowrap font-display uppercase tracking-wide">
            {SITE.name}
          </Link>
          <span className="text-papaya/70">{t("madeBy", { author: SITE.author })}</span>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:ml-auto">
            {external.map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="me noopener noreferrer" className={LINK}>
                {l.label}
              </a>
            ))}
            <Link href="/about#contact" className={LINK}>
              {t("contact")}
            </Link>
          </nav>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-papaya/60">{t("disclaimer")}</p>
      </div>
    </footer>
  );
}
