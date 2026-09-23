import { getTranslations } from "next-intl/server";
import type { SeasonStats } from "@/lib/season-stats";

// Baseball convention: drop the leading zero on sub-1.000 rates (".308"), keep
// it on OPS/SLG that cross 1.000 ("1.002").
function avg3(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const s = v.toFixed(3);
  return s.startsWith("0.") ? s.slice(1) : s;
}
function int0(v: number | null): string {
  return v == null || !Number.isFinite(v) ? "—" : String(Math.round(v));
}
function dec(v: number | null, d: number): string {
  return v == null || !Number.isFinite(v) ? "—" : v.toFixed(d);
}

// P9: year-by-year batting line (basic + advanced) for the overview page.
// Stat abbreviations stay English in both locales (CLAUDE.md). Missing values
// render "—".
export default async function SeasonStatTable({
  stats,
}: {
  stats: SeasonStats[];
}) {
  const t = await getTranslations("Overview");
  // getSeasonStats returns seasons descending; show the most recent three.
  const rows = stats.slice(0, 3);
  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-navy/10 bg-white/50 p-4">
      <h3 className="text-sm font-semibold text-navy">{t("statTableTitle")}</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-right text-sm tabular-nums">
          <thead>
            <tr className="border-b border-navy/15 text-[11px] uppercase tracking-wide text-navy/55">
              <th className="py-1 pr-2 text-left font-semibold">{t("season")}</th>
              <th className="px-2 py-1 font-semibold">PA</th>
              <th className="px-2 py-1 font-semibold">HR</th>
              <th className="px-2 py-1 font-semibold">RBI</th>
              <th className="px-2 py-1 font-semibold">SB</th>
              <th className="px-2 py-1 font-semibold">AVG</th>
              <th className="px-2 py-1 font-semibold">OBP</th>
              <th className="px-2 py-1 font-semibold">SLG</th>
              <th className="px-2 py-1 font-semibold">OPS</th>
              <th className="px-2 py-1 font-semibold">wRC+</th>
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
                <td className="px-2 py-1">{int0(s.pa)}</td>
                <td className="px-2 py-1">{int0(s.hr)}</td>
                <td className="px-2 py-1">{int0(s.rbi)}</td>
                <td className="px-2 py-1">{int0(s.sb)}</td>
                <td className="px-2 py-1">{avg3(s.avg)}</td>
                <td className="px-2 py-1">{avg3(s.obp)}</td>
                <td className="px-2 py-1">{avg3(s.slg)}</td>
                <td className="px-2 py-1">{avg3(s.ops)}</td>
                <td className="px-2 py-1">{int0(s.wrc_plus)}</td>
                <td className="py-1 pl-2">{dec(s.war, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
