import TableExport from "@/components/TableExport";
import { delta, deltaTone, type Direction } from "@/lib/season-deltas";

// P12: one card, two season columns + a Δ chip per metric. Server component,
// no hooks — the discipline / batted-ball cards (overview, M2) and the Compare
// tab (M3) all render through it. Season A is the newer / focus season (brick
// dot), B the comparison (steel dot) — D8. Δ tone follows each metric's own
// direction (lower Chase% is better, lower Whiff% is better for a batter but
// worse for a pitcher…); `neutral` metrics are never coloured.

// pct: raw fraction shown as 24.5% (Δ in pts) · rate3: .292 · mph / dec1: 1 dp ·
// dec2: ERA-style 2 dp · int: counts · ip: baseball innings (170.1 = 170⅓; the Δ
// is computed in outs, never by subtracting the decimals).
export type CompareFormat = "pct" | "mph" | "rate3" | "dec1" | "dec2" | "int" | "ip";

export type CompareRow = {
  key: string;
  label: string; // stat name — stays English in every locale (Chase%, CSW%…)
  hint?: string; // translated plain-language one-liner
  a: number | null;
  b?: number | null;
  format: CompareFormat;
  direction: Direction;
  // Zone-based rates across the 2026 zone change: the population-wide change
  // (a − b) to subtract. Set → the Δ is shown net of it and marked with †.
  shift?: number | null;
  // Pre-formatted cells for non-numeric rows (W-L); no Δ is shown.
  text?: [string, string];
};

function rate3(v: number): string {
  const s = v.toFixed(3);
  return s.startsWith("0.") ? s.slice(1) : s.startsWith("-0.") ? `-${s.slice(2)}` : s;
}

function ipToOuts(v: number): number {
  const whole = Math.trunc(v);
  return whole * 3 + Math.round((v - whole) * 10);
}

function value(v: number | null | undefined, format: CompareFormat): string {
  if (v == null || !Number.isFinite(v)) return "—";
  switch (format) {
    case "pct": return `${(v * 100).toFixed(1)}%`;
    case "mph": case "dec1": case "ip": return v.toFixed(1);
    case "dec2": return v.toFixed(2);
    case "int": return v.toFixed(0);
    default: return rate3(v);
  }
}

// Signed change. `d` is a − b, except for ip, where it is a difference in outs.
function change(d: number, format: CompareFormat, ptsSuffix = ""): string {
  const sign = d > 0 ? "+" : d < 0 ? "−" : "±";
  const x = Math.abs(d);
  switch (format) {
    case "pct": return `${sign}${(x * 100).toFixed(1)}${ptsSuffix}`;
    case "mph": case "dec1": return `${sign}${x.toFixed(1)}`;
    case "dec2": return `${sign}${x.toFixed(2)}`;
    case "int": return `${sign}${x.toFixed(0)}`;
    case "ip": return `${sign}${Math.floor(x / 3)}.${x % 3}`;
    default: return `${sign}${rate3(x)}`;
  }
}

// Changes smaller than this are noise at these sample sizes: shown, never coloured.
const FLAT_BELOW: Record<CompareFormat, number> = {
  pct: 0.002, mph: 0.1, rate3: 0.002, dec1: 0.05, dec2: 0.005, int: 0, ip: 0,
};

const TONE_CLASS = {
  better: "bg-grass/25 text-navy",
  worse: "bg-brick/15 text-lava",
  flat: "bg-navy/5 text-navy/60",
} as const;

export default function SeasonCompareCard({
  title,
  subtitle,
  seasonA,
  seasonB,
  sample,
  rows,
  notes,
  labels,
  exportName,
}: {
  title: string;
  subtitle?: string;
  seasonA: number;
  seasonB: number | null;
  // Volume row shown first (PA, pitches, batted balls) so small samples are visible.
  sample?: { label: string; a: number | null; b: number | null; small?: boolean };
  rows: CompareRow[];
  notes?: string[];
  // changeUnit: shown once in the header (cards that are all pct). ptsSuffix:
  // appended to each pct chip instead (mixed-format cards, e.g. the season line).
  labels: { metric: string; change: string; changeUnit?: string; ptsSuffix?: string; smallSample: string };
  exportName?: string; // player name, leads the table PNG caption
}) {
  const hasB = seasonB != null;
  // Delta + tone per row, shared by the rendered chips and the copied TSV.
  const computed = rows.map((r) => {
    const raw =
      r.text != null
        ? null
        : r.format === "ip"
          ? delta(r.a == null ? null : ipToOuts(r.a), r.b == null ? null : ipToOuts(r.b))
          : delta(r.a, r.b);
    const d = raw != null && r.shift != null ? raw - r.shift : raw;
    return { r, d, tone: deltaTone(d, r.direction, FLAT_BELOW[r.format]) };
  });
  // M7: the same cells as plain text for "Copy table".
  const copyHeaders = [labels.metric, String(seasonA), ...(hasB ? [String(seasonB), labels.change] : [])];
  const copyRows = [
    ...(sample ? [[sample.label, sample.a, ...(hasB ? [sample.b, ""] : [])]] : []),
    ...computed.map(({ r, d }) => [
      r.label,
      r.text ? r.text[0] : value(r.a, r.format),
      ...(hasB
        ? [
            r.text ? r.text[1] : value(r.b, r.format),
            d == null ? "" : `${change(d, r.format, labels.ptsSuffix)}${r.shift != null ? "†" : ""}`,
          ]
        : []),
    ]),
  ];
  const caption = [exportName, title, subtitle, hasB ? `${seasonA} vs ${seasonB}` : seasonA].filter(Boolean).join(" · ");
  return (
    <div className="rounded-lg border border-navy/10 bg-white/50 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-navy">
          {title}
          {subtitle && <span className="font-normal text-navy/45"> · {subtitle}</span>}
        </h3>
        <TableExport headers={copyHeaders} rows={copyRows} name={caption} caption={caption} />
      </div>
      <table className="mt-3 w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b border-navy/10 text-[11px] uppercase tracking-wide text-navy/50">
            <th className="py-1 pr-2 text-left font-semibold">{labels.metric}</th>
            <th className="px-2 py-1 text-right font-semibold">
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-brick align-middle" aria-hidden />
              {seasonA}
            </th>
            {hasB && (
              <th className="px-2 py-1 text-right font-semibold">
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-steel align-middle" aria-hidden />
                {seasonB}
              </th>
            )}
            {hasB && (
              <th className="whitespace-nowrap py-1 pl-2 text-right font-semibold">
                {labels.change}
                {labels.changeUnit && (
                  <span className="ml-1 hidden font-normal normal-case text-navy/40 sm:inline">
                    {labels.changeUnit}
                  </span>
                )}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {sample && (
            <tr className="border-b border-navy/5 text-xs text-navy/55">
              <td className="py-1 pr-2">
                {sample.label}
                {sample.small && (
                  <span className="ml-2 rounded bg-dirt/40 px-1 py-px text-[10px] text-navy/70">
                    {labels.smallSample}
                  </span>
                )}
              </td>
              <td className="px-2 py-1 text-right">{sample.a ?? "—"}</td>
              {hasB && <td className="px-2 py-1 text-right">{sample.b ?? "—"}</td>}
              {hasB && <td />}
            </tr>
          )}
          {computed.map(({ r, d, tone }) => {
            return (
              <tr key={r.key} className="border-b border-navy/5 last:border-0 align-top">
                <td className="py-1.5 pr-2">
                  <div className="font-semibold text-navy">{r.label}</div>
                  {r.hint && <div className="text-[11px] leading-tight text-navy/50">{r.hint}</div>}
                </td>
                <td className="px-2 py-1.5 text-right text-navy">{r.text ? r.text[0] : value(r.a, r.format)}</td>
                {hasB && (
                  <td className="px-2 py-1.5 text-right text-navy/70">
                    {r.text ? r.text[1] : value(r.b, r.format)}
                  </td>
                )}
                {hasB && (
                  <td className="py-1.5 pl-2 text-right">
                    {d == null ? (
                      <span className="text-navy/40">—</span>
                    ) : (
                      <span className={`inline-block rounded-full px-1.5 text-xs ${TONE_CLASS[tone]}`}>
                        {change(d, r.format, labels.ptsSuffix)}
                        {r.shift != null && "†"}
                      </span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {notes && notes.length > 0 && (
        <div className="mt-2 space-y-0.5 text-[11px] leading-snug text-navy/50">
          {notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      )}
    </div>
  );
}
