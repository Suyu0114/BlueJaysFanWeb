import { getTranslations } from "next-intl/server";
import type { SeasonStats } from "@/lib/season-stats";

function int0(v: number | null): string {
  return v == null || !Number.isFinite(v) ? "—" : String(Math.round(v));
}
function dec(v: number | null, d: number): string {
  return v == null || !Number.isFinite(v) ? "—" : v.toFixed(d);
}
// k_pct/bb_pct are stored as raw fractions (0.245) per the FanGraphs export.
function pct1(v: number | null): string {
  return v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(1)}%`;
}
// FanGraphs IP is baseball notation already (170.1 = 170 1/3) — display verbatim.
function ip1(v: number | null): string {
  return v == null || !Number.isFinite(v) ? "—" : v.toFixed(1);
}

// P10: year-by-year pitching line for the overview page. Mirrors
// SeasonStatTable (the batter twin). Stat abbreviations stay English in both
// locales (CLAUDE.md). WHIP/K%/BB% are NULL until the FanGraphs pitching CSV is
// re-exported as a Custom Report with them; they render "—".
export default async function PitcherSeasonStatTable({
  stats,
}: {
  stats: SeasonStats[];
}) {
  const t = await getTranslations("Overview");
  // getSeasonStats returns seasons descending; show the most recent three.
  // Keep rows that have any pitching signal (era or ip) so a two-way player's
  // batting-only season doesn't render an all-dash row.
  const rows = stats.filter((s) => s.era != null || s.ip != null).slice(0, 3);
  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-navy/10 bg-white/50 p-4">
      <h3 className="text-sm font-semibold text-navy">
        {t("pitcherStatTableTitle")}
      </h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[38rem] text-right text-sm tabular-nums">
          <thead>
            <tr className="border-b border-navy/15 text-[11px] uppercase tracking-wide text-navy/55">
              <th className="py-1 pr-2 text-left font-semibold">{t("season")}</th>
              <th className="px-2 py-1 font-semibold">W-L</th>
              <th className="px-2 py-1 font-semibold">SV</th>
              <th className="px-2 py-1 font-semibold">GS</th>
              <th className="px-2 py-1 font-semibold">IP</th>
              <th className="px-2 py-1 font-semibold">ERA</th>
              <th className="px-2 py-1 font-semibold">WHIP</th>
              <th className="px-2 py-1 font-semibold">K%</th>
              <th className="px-2 py-1 font-semibold">BB%</th>
              <th className="px-2 py-1 font-semibold">FIP</th>
              <th className="py-1 pl-2 font-semibold">WAR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr
                key={s.season}
                className="border-b border-navy/5 text-navy last:border-0"
              >
                <td className="py-1 pr-2 text-left font-medium">{s.season}</td>
                <td className="px-2 py-1">
                  {s.w == null && s.l == null
                    ? "—"
                    : `${int0(s.w)}-${int0(s.l)}`}
                </td>
                <td className="px-2 py-1">{int0(s.sv)}</td>
                <td className="px-2 py-1">{int0(s.gs)}</td>
                <td className="px-2 py-1">{ip1(s.ip)}</td>
                <td className="px-2 py-1">{dec(s.era, 2)}</td>
                <td className="px-2 py-1">{dec(s.whip, 2)}</td>
                <td className="px-2 py-1">{pct1(s.k_pct)}</td>
                <td className="px-2 py-1">{pct1(s.bb_pct)}</td>
                <td className="px-2 py-1">{dec(s.fip, 2)}</td>
                <td className="py-1 pl-2">{dec(s.war, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
