import { getTranslations } from "next-intl/server";
import { formatInningsPitched } from "@/lib/games";
import type { PitchingSplit } from "@/lib/pitching-form";

function dec(v: number | null, d: number): string {
  return v == null || !Number.isFinite(v) ? "—" : v.toFixed(d);
}

// P10: "is he dealing or struggling?" — Last 5 outings / Last 30 days / Season,
// computed from the per-appearance log (lib/pitching-form.ts::summarizePitching).
// Box-score ER/outs are exact, so no approximation footnote is needed (unlike
// the batter RecentForm's OBP-sans-SF note). ERA/WHIP are null for 0-out
// windows and render "—".
export default async function PitcherRecentForm({
  last5,
  last30,
  season,
}: {
  last5: PitchingSplit;
  last30: PitchingSplit;
  season: PitchingSplit;
}) {
  const t = await getTranslations("Overview");

  const windows = [
    { label: t("lastNApp", { n: 5 }), split: last5 },
    { label: t("last30"), split: last30 },
    { label: t("season"), split: season },
  ];

  return (
    <div className="rounded-lg border border-navy/10 bg-white/50 p-4">
      <h3 className="text-sm font-semibold text-navy">
        {t("pitcherRecentFormTitle")}
      </h3>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {windows.map((w) => (
          <div
            key={w.label}
            className="rounded-md border border-steel/20 bg-white/50 p-3"
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-navy/45">
              {w.label}
            </div>
            {w.split.games === 0 ? (
              <p className="mt-1 text-sm text-navy/50">{t("noRecentGames")}</p>
            ) : (
              <>
                <div className="mt-1 text-lg font-semibold tabular-nums text-navy">
                  {dec(w.split.era, 2)} ERA
                </div>
                <div className="mt-1 text-xs tabular-nums text-navy/60">
                  {w.split.games} G · {formatInningsPitched(w.split.outs)} IP ·{" "}
                  {w.split.so} K · {w.split.bb} BB · {dec(w.split.whip, 2)} WHIP
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
