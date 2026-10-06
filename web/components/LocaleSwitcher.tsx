"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

// EN | 中文 pill: the current locale filled, the other a plain link to the same
// page — one tap, and it works without JS. Short label in the pill, the full
// name in the tooltip. (The query string is dropped, as before.)
const LABELS: Record<string, { short: string; full: string }> = {
  en: { short: "EN", full: "English" },
  "zh-TW": { short: "中文", full: "繁體中文" },
};

export function LocaleSwitcher() {
  const t = useTranslations("Nav");
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <div
      role="group"
      aria-label={t("language")}
      className="inline-flex shrink-0 overflow-hidden rounded-md border border-steel text-xs"
    >
      {routing.locales.map((l) => {
        const label = LABELS[l] ?? { short: l, full: l };
        const cls = "px-2 py-1.5 leading-none";
        return l === locale ? (
          <span key={l} lang={l} title={label.full} aria-current="true" className={`${cls} bg-papaya text-navy`}>
            {label.short}
          </span>
        ) : (
          <Link
            key={l}
            href={pathname}
            locale={l}
            lang={l}
            title={label.full}
            className={`${cls} transition-colors hover:bg-steel/30`}
          >
            {label.short}
          </Link>
        );
      })}
    </div>
  );
}
