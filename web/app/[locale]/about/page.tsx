import { use } from "react";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Reveal } from "@/components/motion/Reveal";

export default function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("About");

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <Reveal>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      </Reveal>
      <Reveal delay={0.1}>
        <p className="mt-4 max-w-prose text-navy/70">{t("body")}</p>
      </Reveal>
    </div>
  );
}
