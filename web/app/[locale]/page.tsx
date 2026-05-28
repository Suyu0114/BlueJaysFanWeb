import { use } from "react";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("Home");

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {t("title")}
      </h1>
      <p className="mt-4 max-w-prose text-lg text-zinc-600 dark:text-zinc-400">
        {t("subtitle")}
      </p>
      <Link
        href="/players"
        className="mt-8 inline-flex items-center rounded-full bg-blue-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-800"
      >
        {t("viewRoster")}
      </Link>
    </div>
  );
}
