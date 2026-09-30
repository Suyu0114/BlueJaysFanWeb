import { percentileColor, rankPercentile } from "@/lib/percentile-color";

// P13 (T9): the legend for the 30-club rank shading — the same steel -> neutral
// -> brick scale as the P12 percentile bars, labelled with the two ends.

const STOPS = [30, 23, 16, 8, 1];

export default function RankKey({ label, best, worst }: { label: string; best: string; worst: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-navy/60">
      <span>{label}</span>
      <span className="tabular-nums">{worst}</span>
      <span className="flex overflow-hidden rounded-sm" aria-hidden>
        {STOPS.map((r) => (
          <span key={r} className="h-2.5 w-5" style={{ background: percentileColor(rankPercentile(r)) }} />
        ))}
      </span>
      <span className="tabular-nums">{best}</span>
    </div>
  );
}
