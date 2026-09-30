import { getTranslations } from "next-intl/server";
import { METRICS, metricLabel, type MetricGroup } from "@/lib/team-metrics";

// P13 module ⑥: how to read the page — the method in a few plain sentences,
// then every metric's one-line definition grouped like the grids (the same hint
// the rank-grid cards show). <details> keeps the long list out of the way and
// still works without JavaScript.

const GROUPS: MetricGroup[] = [
  "record",
  "offense",
  "contact",
  "profile",
  "prevention",
  "contactAllowed",
  "defense",
  "rotation",
  "bullpen",
];
const METHOD_KEYS = ["methodSeason", "methodAverage", "methodRank", "methodRules", "methodSabermetrics", "methodSources"] as const;

export default async function TeamGlossary() {
  const t = await getTranslations("Team");
  return (
    <div className="space-y-4 text-sm text-navy">
      <ul className="list-disc space-y-1.5 pl-5 leading-snug text-navy/80">
        {METHOD_KEYS.map((k) => (
          <li key={k}>{t(k)}</li>
        ))}
      </ul>
      <details className="group rounded-md border border-navy/10 bg-papaya/50 p-3">
        <summary className="cursor-pointer select-none font-semibold text-navy transition-colors hover:text-brick">
          {t("glossaryAll")}
        </summary>
        <div className="mt-3 grid gap-x-8 gap-y-4 md:grid-cols-2">
          {GROUPS.map((g) => (
            <div key={g}>
              <h4 className="font-display text-[11px] uppercase tracking-wider text-navy/55">{t(`sections.${g}`)}</h4>
              <dl className="mt-1 space-y-1">
                {METRICS.filter((m) => m.group === g).map((m) => (
                  <div key={m.key} className="flex gap-2 text-xs leading-snug">
                    <dt className="w-24 shrink-0 font-semibold">{metricLabel(m, t)}</dt>
                    <dd className="text-navy/70">{t(`hints.${m.key}`)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
