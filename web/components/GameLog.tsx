import { getLocale, getTranslations } from "next-intl/server";
import type { BatterGameRow } from "@/lib/batter-game-log";

function int0(v: number | null): string {
  return v == null || !Number.isFinite(v) ? "—" : String(Math.round(v));
}

// P9: last-10 game log (most recent first). `games` is already sliced + reversed
// by the page. W/L colored grass/brick, matching the schedule calendar's
// win/loss convention.
export default async function GameLog({ games }: { games: BatterGameRow[] }) {
  const t = await getTranslations("Overview");
  const locale = await getLocale();
  if (games.length === 0) return null;

  const dateFmt = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const fmtDate = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return dateFmt.format(new Date(Date.UTC(y, m - 1, d)));
  };

  return (
    <div className="rounded-lg border border-navy/10 bg-white/50 p-4">
      <h3 className="text-sm font-semibold text-navy">{t("gameLogTitle")}</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-right text-sm tabular-nums">
          <thead>
            <tr className="border-b border-navy/15 text-[11px] uppercase tracking-wide text-navy/55">
              <th className="py-1 pr-2 text-left font-semibold">
                {t("colDate")}
              </th>
              <th className="px-2 py-1 text-left font-semibold">
                {t("colOpp")}
              </th>
              <th className="px-2 py-1 text-left font-semibold">
                {t("colResult")}
              </th>
              <th className="px-2 py-1 font-semibold">AB</th>
              <th className="px-2 py-1 font-semibold">H</th>
              <th className="px-2 py-1 font-semibold">HR</th>
              <th className="px-2 py-1 font-semibold">RBI</th>
              <th className="px-2 py-1 font-semibold">BB</th>
              <th className="py-1 pl-2 font-semibold">K</th>
            </tr>
          </thead>
          <tbody>
            {games.map((g) => (
              <tr
                key={g.game_pk}
                className="border-b border-navy/5 text-navy last:border-0"
              >
                <td className="py-1 pr-2 text-left text-navy/70">
                  {fmtDate(g.game_date)}
                </td>
                <td className="px-2 py-1 text-left">
                  {(g.is_home ? "vs " : "@ ") + g.opponent_name}
                </td>
                <td className="px-2 py-1 text-left">
                  {g.result ? (
                    <span
                      className={
                        g.result === "W" ? "text-grass" : "text-brick"
                      }
                    >
                      {g.result} {g.jays_score}-{g.opp_score}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-2 py-1">{int0(g.ab)}</td>
                <td className="px-2 py-1">{int0(g.h)}</td>
                <td className="px-2 py-1">{int0(g.hr)}</td>
                <td className="px-2 py-1">{int0(g.rbi)}</td>
                <td className="px-2 py-1">{int0(g.bb)}</td>
                <td className="py-1 pl-2">{int0(g.so)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
