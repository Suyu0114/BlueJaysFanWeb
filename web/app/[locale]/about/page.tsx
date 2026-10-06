import { use } from "react";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import ContactEmail from "@/components/ContactEmail";
import ScorecardFrame from "@/components/ScorecardFrame";
import { Reveal } from "@/components/motion/Reveal";
import { SITE, xHandle } from "@/lib/site";

// Who made the site and how to reach them: the bio, a contact card (#contact,
// linked from the footer on every page), how the data is built, and the credit
// rule for shared charts. Names, links and the brand come from lib/site.ts. The
// not-affiliated disclaimer lives in the footer, so it isn't repeated here.

const H2 = "font-display text-base uppercase tracking-wide text-navy";
const LINK =
  "text-navy underline decoration-navy/30 underline-offset-4 transition-colors hover:text-brick hover:decoration-brick";
const NOTE = "mt-0.5 text-xs text-navy/55";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "About" });
  return { title: t("title") };
}

export default function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("About");

  // schema.org Person: ties the name to the profiles for search engines.
  // The email stays out of it on purpose (scrapers read JSON-LD too).
  const person = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: SITE.author,
    url: `${SITE.url}/${locale}/about`,
    sameAs: [SITE.links.linkedin, SITE.links.portfolio, SITE.links.x, SITE.links.instagram].filter(Boolean),
  };
  const host = (url: string) => new URL(url).host;

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(person).replace(/</g, "\\u003c") }}
      />
      <Reveal>
        <h1 className="font-display text-3xl uppercase tracking-wide">{t("title")}</h1>
      </Reveal>
      <Reveal delay={0.1}>
        <p className="mt-4 max-w-prose text-lg text-navy/80">
          {t("lede", { site: SITE.name, author: SITE.author })}
        </p>
      </Reveal>

      <div className="mt-10 grid gap-8 md:grid-cols-[minmax(0,1fr)_18rem] md:items-start">
        <Reveal as="section">
          <h2 className={H2}>{t("whoTitle")}</h2>
          <div className="mt-3 max-w-prose space-y-3 text-navy/80">
            <p>{t("bio1")}</p>
            <p>{t("bio2")}</p>
            <p className="text-navy">{t("bio3")}</p>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <section id="contact" className="scroll-mt-6">
            <ScorecardFrame seedKey="about-contact" variant="panel">
              <div className="relative z-10 p-5">
                <h2 className={H2}>{t("contactTitle")}</h2>
                <ul className="mt-4 space-y-4 text-sm">
                  <li>
                    <a
                      href={SITE.links.linkedin}
                      target="_blank"
                      rel="me noopener noreferrer"
                      className="inline-flex rounded-md bg-brick px-3 py-1.5 font-medium text-papaya transition-colors hover:bg-lava"
                    >
                      LinkedIn ↗
                    </a>
                    <p className={NOTE}>{t("linkedinNote")}</p>
                  </li>
                  <li>
                    <a href={SITE.links.portfolio} target="_blank" rel="me noopener noreferrer" className={LINK}>
                      {host(SITE.links.portfolio)} ↗
                    </a>
                    <p className={NOTE}>{t("portfolioNote")}</p>
                  </li>
                  <li>
                    <ContactEmail className={LINK} />
                    <p className={NOTE}>{t("emailNote")}</p>
                  </li>
                  {SITE.links.x && (
                    <li>
                      <a href={SITE.links.x} target="_blank" rel="me noopener noreferrer" className={LINK}>
                        @{xHandle()} ↗
                      </a>
                      <p className={NOTE}>{t("xNote")}</p>
                    </li>
                  )}
                  {SITE.links.instagram && (
                    <li>
                      <a href={SITE.links.instagram} target="_blank" rel="me noopener noreferrer" className={LINK}>
                        Instagram ↗
                      </a>
                      <p className={NOTE}>{t("instagramNote")}</p>
                    </li>
                  )}
                </ul>
              </div>
            </ScorecardFrame>
          </section>
        </Reveal>
      </div>

      <div className="mt-12 grid gap-8 md:grid-cols-2">
        <Reveal as="section">
          <h2 className={H2}>{t("dataTitle")}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-navy/80 marker:text-brick">
            <li>{t("data1")}</li>
            <li>{t("data2")}</li>
            <li>{t("data3")}</li>
          </ul>
        </Reveal>
        <Reveal as="section" delay={0.1}>
          <h2 className={H2}>{t("shareTitle")}</h2>
          <p className="mt-3 text-sm text-navy/80">{t("shareBody")}</p>
        </Reveal>
      </div>
    </div>
  );
}
