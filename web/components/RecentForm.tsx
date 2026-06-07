import { getTranslations } from "next-intl/server";
import type { BattingSplit } from "@/lib/batting-form";

function avg3(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const s = v.toFixed(3);
  return s.startsWith("0.") ? s.slice(1) : s;
}

// P9: "is he hot or cold?" — Last 7 / Last 30 / Season slash lines, computed
// from the per-game log (lib/batting-form.ts::summarize). OBP omits sacrifice
// flies (no SF column in the box score) — see the footnote.
export default async function RecentForm({
  last7,
  last30,
  season,
}: {
  last7: BattingSplit;
  last30: BattingSplit;
  season: BattingSplit;
}) {
  const t = await getTranslations("Overview");

  const windows = [
    { label: t("last7"), split: last7 },
    { label: t("last30"), split: last30 },
    { label: t("season"), split: season },
  ];

  return (
    <div className="rounded-lg border border-navy/10 bg-white/50 p-4">
      <h3 className="text-sm font-semibold text-navy">
        {t("recentFormTitle")}
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
                  {avg3(w.split.avg)}/{avg3(w.split.obp)}/{avg3(w.split.slg)}
                </div>
                <div className="mt-1 text-xs tabular-nums text-navy/60">
                  {w.split.games} G · {w.split.hr} HR · {w.split.rbi} RBI ·{" "}
                  {w.split.sb} SB
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-navy/45">{t("obpApproxNote")}</p>
    </div>
  );
}
