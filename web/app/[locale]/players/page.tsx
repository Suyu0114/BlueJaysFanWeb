import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getRosterByMode, type RosterMode } from "@/lib/players";

export const revalidate = 86400;

function isMode(value: string | undefined): value is RosterMode {
  return value === "current" || value === "all-time";
}

export default async function PlayersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { locale } = await params;
  const { mode: modeParam } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("Roster");

  const mode: RosterMode = isMode(modeParam) ? modeParam : "current";
  const players = await getRosterByMode(mode);

  const subtitle = mode === "all-time" ? t("subtitleAll") : t("subtitle");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-navy/60">{subtitle}</p>
        </div>
        <div
          role="tablist"
          aria-label={t("modeLabel")}
          className="flex rounded-full border border-navy/15 bg-white/60 p-0.5 text-xs"
        >
          {(["current", "all-time"] as const).map((m) => {
            const active = m === mode;
            return (
              <Link
                key={m}
                href={m === "current" ? "/players" : "/players?mode=all-time"}
                role="tab"
                aria-selected={active}
                className={`rounded-full px-3 py-1 font-medium transition-colors ${
                  active
                    ? "bg-brick text-white"
                    : "text-navy/65 hover:text-navy"
                }`}
              >
                {m === "current" ? t("tabCurrent") : t("tabAll")}
              </Link>
            );
          })}
        </div>
      </div>

      {players.length === 0 ? (
        <p className="mt-8 text-zinc-500">{t("empty")}</p>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {players.map((p) => (
            <li key={p.mlbam_id}>
              <Link
                href={`/players/${p.mlbam_id}`}
                className="block rounded-xl border border-brick/20 bg-white p-4 transition-shadow hover:border-brick hover:shadow-md"
              >
                {p.headshot_url && (
                  <Image
                    src={p.headshot_url}
                    alt={p.name}
                    width={120}
                    height={120}
                    unoptimized
                    className="mx-auto rounded-full bg-papaya"
                  />
                )}
                <div className="mt-3 text-center">
                  <div className="font-medium text-navy">{p.name}</div>
                  <div className="mt-1 text-xs text-navy/60">
                    {p.position}
                    {p.bats && p.throws && (
                      <>
                        {" · "}
                        {t("bats")} {p.bats} / {t("throws")} {p.throws}
                      </>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
