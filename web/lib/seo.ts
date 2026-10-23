import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { getPlayer } from "@/lib/players";

// Search-engine metadata shared by the pages: each language version is its own
// URL (canonical), linked to its translation (hreflang), and x-default sends
// every other language to English. Paths are relative; metadataBase in
// app/[locale]/layout.tsx makes them absolute. The sitemap lists the same pairs.

export function localeAlternates(locale: string, path = ""): NonNullable<Metadata["alternates"]> {
  return {
    canonical: `/${locale}${path}`,
    languages: {
      ...Object.fromEntries(routing.locales.map((l) => [l, `/${l}${path}`])),
      "x-default": `/${routing.defaultLocale}${path}`,
    },
  };
}

export type PlayerSection = "batting" | "pitching" | "fielding" | "compare";

/** A player page's title / description / alternates: "{name} stats" on the
 *  overview, "{name} · Batting" on a tab. Unknown id -> {} (the page 404s). */
export async function playerMetadata(locale: string, mlbamId: string, section?: PlayerSection): Promise<Metadata> {
  const id = Number(mlbamId);
  const player = Number.isFinite(id) ? await getPlayer(id) : null;
  if (!player) return {};
  const t = await getTranslations({ locale, namespace: "Meta" });
  const nav = await getTranslations({ locale, namespace: "PlayerNav" });
  return {
    title: section ? `${player.name} · ${nav(section)}` : t("playerTitle", { name: player.name }),
    description: t("playerDescription", { name: player.name }),
    alternates: localeAlternates(locale, `/players/${id}${section ? `/${section}` : ""}`),
  };
}
