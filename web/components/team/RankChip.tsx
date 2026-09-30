import { ordinal } from "@/lib/ordinal";
import { rankTint } from "@/lib/percentile-color";

// P13 (T9): an MLB rank as a small chip, tinted on the shared percentile scale
// (1st = brick … 30th = steel) with the ordinal printed — never colour-only.

export default function RankChip({
  rank,
  tied = false,
  locale,
  title,
  small = false,
  className = "",
}: {
  rank: number | null | undefined;
  tied?: boolean;
  locale: string;
  title?: string;
  small?: boolean;
  className?: string;
}) {
  if (rank == null) return <span className={`text-navy/45 ${className}`}>—</span>;
  return (
    <span
      title={title}
      className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-center tabular-nums text-navy ${small ? "text-[10px]" : "text-xs"} ${className}`}
      style={{ background: rankTint(rank) }}
    >
      {ordinal(rank, locale, tied)}
    </span>
  );
}
