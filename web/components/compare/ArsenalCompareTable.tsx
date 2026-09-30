import CopyTableButton from "@/components/CopyTableButton";
import type { ArsenalCompareRow } from "@/lib/pitch-arsenal";
import { colorFor } from "@/lib/pitch-colors";

// P12 M3: the arsenal, season A vs B — usage / velo / spin / Whiff% / xwOBAcon
// per pitch type (buildArsenal on each season's pitches), with NEW / DROPPED
// badges (usage 0 ↔ ≥ 5%). Cells read "A / B"; the velo change gets its own
// column because it's the number fans ask about first.

const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const d1 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(1));
const int = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(0));
const r3 = (v: number | null | undefined) => {
  if (v == null) return "—";
  const s = v.toFixed(3);
  return s.startsWith("0.") ? s.slice(1) : s;
};

function Pair({ a, b }: { a: string; b: string }) {
  return (
    <>
      <span className="text-navy">{a}</span>
      <span className="text-navy/35"> / </span>
      <span className="text-navy/60">{b}</span>
    </>
  );
}

export default function ArsenalCompareTable({
  rows,
  seasonA,
  seasonB,
  labels,
}: {
  rows: ArsenalCompareRow[];
  seasonA: number;
  seasonB: number;
  labels: {
    pitch: string;
    usage: string;
    velo: string;
    veloChange: string;
    spin: string;
    whiff: string;
    xwobaCon: string;
    new: string;
    dropped: string;
  };
}) {
  if (rows.length === 0) return null;
  const dvOf = (r: ArsenalCompareRow) =>
    r.a?.avgVelo != null && r.b?.avgVelo != null ? r.a.avgVelo - r.b.avgVelo : null;
  // M7: one column per season per stat, so a spreadsheet can chart it.
  const copyHeaders = [
    labels.pitch, "",
    `${labels.usage} ${seasonA}`, `${labels.usage} ${seasonB}`,
    `${labels.velo} ${seasonA}`, `${labels.velo} ${seasonB}`, labels.veloChange,
    `${labels.spin} ${seasonA}`, `${labels.spin} ${seasonB}`,
    `${labels.whiff} ${seasonA}`, `${labels.whiff} ${seasonB}`,
    `${labels.xwobaCon} ${seasonA}`, `${labels.xwobaCon} ${seasonB}`,
  ];
  const copyRows = rows.map((r) => {
    const dv = dvOf(r);
    return [
      r.pitchType, r.flag === "new" ? labels.new : r.flag === "dropped" ? labels.dropped : "",
      pct(r.a?.usage), pct(r.b?.usage), d1(r.a?.avgVelo), d1(r.b?.avgVelo),
      dv == null ? "" : `${dv >= 0 ? "+" : "−"}${Math.abs(dv).toFixed(1)}`,
      int(r.a?.avgSpin), int(r.b?.avgSpin), pct(r.a?.whiffPct), pct(r.b?.whiffPct),
      r3(r.a?.xwobaCon), r3(r.b?.xwobaCon),
    ];
  });
  return (
    <div className="overflow-x-auto">
      <div className="mb-1 flex justify-end">
        <CopyTableButton headers={copyHeaders} rows={copyRows} />
      </div>
      <table className="w-full min-w-[560px] text-sm tabular-nums">
        <thead>
          <tr className="border-b border-navy/10 text-[11px] uppercase tracking-wide text-navy/50">
            <th className="py-1 pr-2 text-left font-semibold">{labels.pitch}</th>
            <th className="px-2 py-1 text-right font-semibold">{labels.usage}</th>
            <th className="px-2 py-1 text-right font-semibold">{labels.velo}</th>
            <th className="px-2 py-1 text-right font-semibold">{labels.veloChange}</th>
            <th className="px-2 py-1 text-right font-semibold">{labels.spin}</th>
            <th className="px-2 py-1 text-right font-semibold">{labels.whiff}</th>
            <th className="py-1 pl-2 text-right font-semibold">{labels.xwobaCon}</th>
          </tr>
          <tr className="text-[10px] text-navy/40">
            <th />
            <th colSpan={6} className="pb-1 text-right font-normal">
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-brick align-middle" aria-hidden />
              {seasonA}
              <span className="mx-1">/</span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-steel align-middle" aria-hidden />
              {seasonB}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const dv = r.a?.avgVelo != null && r.b?.avgVelo != null ? r.a.avgVelo - r.b.avgVelo : null;
            return (
              <tr key={r.pitchType} className="border-b border-navy/5 last:border-0">
                <td className="py-1.5 pr-2">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorFor(r.pitchType) }} aria-hidden />
                    <span className="font-semibold text-navy">{r.pitchType}</span>
                    {r.flag && (
                      <span
                        className={`rounded px-1 py-px text-[10px] font-semibold uppercase ${
                          r.flag === "new" ? "bg-grass/25 text-navy" : "bg-navy/10 text-navy/60"
                        }`}
                      >
                        {r.flag === "new" ? labels.new : labels.dropped}
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right"><Pair a={pct(r.a?.usage)} b={pct(r.b?.usage)} /></td>
                <td className="px-2 py-1.5 text-right"><Pair a={d1(r.a?.avgVelo)} b={d1(r.b?.avgVelo)} /></td>
                <td className="px-2 py-1.5 text-right text-navy/70">
                  {dv == null ? "—" : `${dv > 0 ? "+" : dv < 0 ? "−" : "±"}${Math.abs(dv).toFixed(1)}`}
                </td>
                <td className="px-2 py-1.5 text-right"><Pair a={int(r.a?.avgSpin)} b={int(r.b?.avgSpin)} /></td>
                <td className="px-2 py-1.5 text-right"><Pair a={pct(r.a?.whiffPct)} b={pct(r.b?.whiffPct)} /></td>
                <td className="py-1.5 pl-2 text-right"><Pair a={r3(r.a?.xwobaCon)} b={r3(r.b?.xwobaCon)} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
