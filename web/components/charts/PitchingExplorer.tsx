"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import PitchDistribution, {
  type PitchEvent,
} from "@/components/charts/PitchDistribution";
import PitchZoneHeatmap from "@/components/charts/PitchZoneHeatmap";

type BatterHand = "all" | "L" | "R";

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-0.5 text-xs font-medium transition-colors ${
        active
          ? "border-navy bg-navy text-papaya"
          : "border-steel/40 text-navy/70 hover:border-steel hover:text-navy"
      }`}
    >
      {children}
    </button>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-navy/45">
        {label}
      </span>
      {children}
    </div>
  );
}

// Client wrapper: holds filter state, feeds filtered pitches to the pure
// PitchDistribution and PitchZoneHeatmap. The pure components never see
// next-intl; all i18n lives here.
export default function PitchingExplorer({
  pitches,
}: {
  pitches: PitchEvent[];
}) {
  const t = useTranslations("Pitching");
  const locale = useLocale();

  const [month, setMonth] = useState("all"); // "all" | "YYYY-MM"
  const [pitchTypes, setPitchTypes] = useState<Set<string>>(new Set());
  const [batterHand, setBatterHand] = useState<BatterHand>("all");

  const { months, pitchOptions } = useMemo(() => {
    const m = new Set<string>();
    const p = new Set<string>();
    for (const e of pitches) {
      if (e.game_date) m.add(e.game_date.slice(0, 7));
      if (e.pitch_type) p.add(e.pitch_type);
    }
    return { months: [...m].sort(), pitchOptions: [...p].sort() };
  }, [pitches]);

  const filtered = useMemo(
    () =>
      pitches.filter((p) => {
        if (month !== "all" && p.game_date.slice(0, 7) !== month) return false;
        if (
          pitchTypes.size > 0 &&
          (!p.pitch_type || !pitchTypes.has(p.pitch_type))
        )
          return false;
        if (batterHand !== "all" && p.stand !== batterHand) return false;
        return true;
      }),
    [pitches, month, pitchTypes, batterHand],
  );

  const distLabels = {
    pitches: t("colCount"),
    avgVelo: t("colAvgVelo"),
  };
  const zoneLabels = {
    legendLow: t("heatmapLow"),
    legendHigh: t("heatmapHigh"),
  };

  const monthFmt = new Intl.DateTimeFormat(locale, {
    month: "short",
    timeZone: "UTC",
  });
  const monthLabel = (ym: string) => {
    const [y, mo] = ym.split("-").map(Number);
    return monthFmt.format(new Date(Date.UTC(y, mo - 1, 1)));
  };

  const togglePitch = (pt: string) =>
    setPitchTypes((prev) => {
      const next = new Set(prev);
      if (next.has(pt)) next.delete(pt);
      else next.add(pt);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <FilterGroup label={t("filterMonth")}>
          <Chip active={month === "all"} onClick={() => setMonth("all")}>
            {t("filterFullSeason")}
          </Chip>
          {months.map((m) => (
            <Chip key={m} active={month === m} onClick={() => setMonth(m)}>
              {monthLabel(m)}
            </Chip>
          ))}
        </FilterGroup>

        {pitchOptions.length > 0 && (
          <FilterGroup label={t("filterPitchType")}>
            {pitchOptions.map((pt) => (
              <Chip
                key={pt}
                active={pitchTypes.has(pt)}
                onClick={() => togglePitch(pt)}
              >
                {pt}
              </Chip>
            ))}
          </FilterGroup>
        )}

        <FilterGroup label={t("filterBatterHand")}>
          <Chip
            active={batterHand === "all"}
            onClick={() => setBatterHand("all")}
          >
            {t("filterAll")}
          </Chip>
          <Chip
            active={batterHand === "L"}
            onClick={() => setBatterHand("L")}
          >
            vs LHH
          </Chip>
          <Chip
            active={batterHand === "R"}
            onClick={() => setBatterHand("R")}
          >
            vs RHH
          </Chip>
        </FilterGroup>

        <p className="text-xs text-navy/50">
          {t("showing", { shown: filtered.length, total: pitches.length })}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-start">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-navy">
            {t("usageTitle")}
          </h2>
          <PitchDistribution pitches={filtered} labels={distLabels} />
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-navy">
            {t("locationTitle")}
          </h2>
          <PitchZoneHeatmap pitches={filtered} labels={zoneLabels} />
        </section>
      </div>
    </div>
  );
}
