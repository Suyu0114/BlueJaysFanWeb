import { getTranslations } from "next-intl/server";
import { formatMetric } from "@/lib/team-metrics";
import type { TeamSeasonRow } from "@/lib/team-trends";

// P13 module ②: contact luck per season — the lineup's wOBA vs the xwOBA its
// contact quality (plus K / BB) would typically produce (Savant's team values;
// the gap is woba_minus_xwoba in the 022 view). Neutral text, not good/bad
// colour: it describes fortune, not skill.

// Same threshold as the player overview's luck line (P12 M6): under .010 of
// wOBA the gap is noise.
export const CONTACT_LUCK_EVEN = 0.01;

export default async function ContactLuck({ rows }: { rows: TeamSeasonRow[] }) {
  const t = await getTranslations("Team");
  return (
    <ul className="grid gap-2 sm:grid-cols-5">
      {rows.map((r) => {
        const d = r.woba_minus_xwoba;
        const diff = d == null ? null : formatMetric(Math.abs(d), "rate3");
        const text =
          d == null
            ? "—"
            : Math.abs(d) < CONTACT_LUCK_EVEN
              ? t("luckEven")
              : t(d > 0 ? "luckGood" : "luckBad", { diff: diff ?? "" });
        return (
          <li key={r.season} className="rounded-md border border-navy/10 bg-papaya/50 px-2.5 py-2 text-xs text-navy">
            <div className="font-display text-[11px] uppercase tracking-wider text-navy/60">{r.season}</div>
            <div className="mt-0.5 tabular-nums">
              wOBA {formatMetric(r.woba, "rate3")} · xwOBA {formatMetric(r.xwoba, "rate3")}
            </div>
            <div className="mt-0.5 text-navy/65">{text}</div>
          </li>
        );
      })}
    </ul>
  );
}
