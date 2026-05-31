import { getTranslations } from "next-intl/server";

type Props = {
  current: number;          // current-season WAR
  prior: number;            // prior-season FINAL WAR (used as bar denominator)
  priorSeason: number;
  currentSeason: number;
  role: "batter" | "pitcher";
  // Required only when role === 'batter'. Used for the 162-game pace projection.
  gamesPlayed?: number;
};

export default async function SeasonProgressBar({
  current,
  prior,
  priorSeason,
  currentSeason,
  role,
  gamesPlayed,
}: Props) {
  const t = await getTranslations("Home");

  // Bar denominator: at least 1.0 so 0-WAR baselines don't divide-by-zero.
  // We extend the visual scale to max(prior, current) so an over-pacing player
  // doesn't fill past 100%.
  const denom = Math.max(Math.abs(prior), Math.abs(current), 1);
  const currentPct = Math.min(100, Math.max(0, (current / denom) * 100));
  const priorPct = Math.min(100, Math.max(0, (prior / denom) * 100));

  const delta = current - prior;
  const deltaPrefix = delta > 0 ? "+" : "";

  // Pace projection only for batters; pitchers see current-vs-prior only.
  const pace =
    role === "batter" && gamesPlayed && gamesPlayed > 0
      ? current * (162 / gamesPlayed)
      : null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-xs text-navy/65">
        <span>{t("seasonProgress", { season: currentSeason })}</span>
        <span title={t("progressDisclaimer")}>
          {t("vsLastYear", { season: priorSeason })}
        </span>
      </div>

      <div
        className="relative h-2 w-full rounded-full bg-navy/10"
        role="img"
        aria-label={t("progressDisclaimer")}
      >
        {/* Prior-year final marker (tick line). */}
        <div
          className="absolute top-[-3px] h-[14px] w-px bg-steel"
          style={{ left: `${priorPct}%` }}
          aria-hidden
        />
        {/* Current-WAR fill. */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-brick"
          style={{ width: `${currentPct}%` }}
        />
      </div>

      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-navy">
          {current.toFixed(1)} WAR
          {pace !== null && (
            <span className="ml-2 font-normal text-navy/65">
              {t("onPaceFor", { pace: pace.toFixed(1) })}
            </span>
          )}
        </span>
        <span className={delta >= 0 ? "text-grass" : "text-brick"}>
          {deltaPrefix}
          {delta.toFixed(1)}
        </span>
      </div>
    </div>
  );
}
