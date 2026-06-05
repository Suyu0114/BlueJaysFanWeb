import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import RosterExplorer from "@/components/RosterExplorer";
import ScorecardFrame from "@/components/ScorecardFrame";
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
          <h1 className="font-display text-2xl uppercase tracking-wide text-navy">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-navy/60">{subtitle}</p>
        </div>
        <ScorecardFrame
          seedKey="roster-mode-toggle"
          variant="control"
          className="text-xs"
        >
          <div
            role="tablist"
            aria-label={t("modeLabel")}
            className="relative z-10 flex p-1"
          >
            {(["current", "all-time"] as const).map((m) => {
              const active = m === mode;
              return (
                <Link
                  key={m}
                  href={m === "current" ? "/players" : "/players?mode=all-time"}
                  role="tab"
                  aria-selected={active}
                  className={`rounded-none px-3 py-1 font-medium transition-colors ${
                    active
                      ? "bg-brick text-papaya"
                      : "text-navy/65 hover:text-navy"
                  }`}
                >
                  {m === "current" ? t("tabCurrent") : t("tabAll")}
                </Link>
              );
            })}
          </div>
        </ScorecardFrame>
      </div>

      {players.length === 0 ? (
        <p className="mt-8 text-navy/55">{t("empty")}</p>
      ) : (
        <RosterExplorer players={players} mode={mode} />
      )}
    </div>
  );
}
