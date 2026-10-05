"use client";

// P13 modules ② / ③: a metric × season grid. Each cell shows the Jays' value
// and rank among 30 clubs, tinted on the shared percentile scale (1st = brick,
// 30th = steel, ordinal always printed). A toggle swaps values for "vs MLB"
// (100 = the MLB average; WAR / OAA / run diff as the gap to the average club;
// wRC+ is already an index). Hover — or tab / tap onto a cell — opens a card
// with the MLB average, the MLB leader and a one-line plain-English hint,
// through ChartTooltip + useLingeringHover (glides between cells, no blink).
// All numbers arrive as plain JSON from the 022 views via lib/team-grid.ts.

import { Fragment, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import ChartTooltip from "@/components/charts/ChartTooltip";
import TableExport from "@/components/TableExport";
import ScorecardFrame from "@/components/ScorecardFrame";
import SlidingPill from "@/components/motion/SlidingPill";
import { TeamLogo } from "@/components/TeamLogo";
import { HEAD_ROW, TH, TH_FIRST, TH_LAST } from "@/components/standings-chrome";
import { ordinal } from "@/lib/ordinal";
import { rankTint } from "@/lib/percentile-color";
import type { GridCell, GridRow } from "@/lib/team-grid";
import { formatMetric, METRIC, metricLabel, vsMlb, type MetricDef } from "@/lib/team-metrics";
import { TORONTO_TEAM_ID } from "@/lib/team-ids";
import { useLingeringHover } from "@/lib/use-lingering-hover";

type Mode = "value" | "vsMlb";
type Target = { row: number; col: number; left: number; top: number };

function signedFormat(v: number, def: MetricDef): string {
  const s = def.format === "dec1" ? Math.abs(v).toFixed(1) : Math.abs(Math.round(v)).toString();
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}

function display(def: MetricDef, cell: GridCell, mode: Mode): string {
  if (mode === "value" || def.vsMlb === "self") return formatMetric(cell.value, def.format);
  const v = vsMlb(def, cell.value, cell.mlb);
  if (v == null) return "—";
  return def.vsMlb === "diff" ? signedFormat(v, def) : Math.round(v).toString();
}

export default function RankGrid({
  seedKey,
  rows,
  seasons,
  copyName,
}: {
  seedKey: string;
  rows: GridRow[];
  seasons: number[];
  copyName: string; // first header cell of the copied table
}) {
  const t = useTranslations("Team");
  const locale = useLocale();
  const [mode, setMode] = useState<Mode>("value");
  const wrap = useRef<HTMLDivElement>(null);
  const { hovered, last, enter, leave } = useLingeringHover<Target>();

  const label = (def: MetricDef) => metricLabel(def, t);
  const open = (el: HTMLElement, row: number, col: number) => {
    const box = wrap.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!box) return;
    // Keep the ~16rem card inside the grid: clamp its centre half a card from
    // either edge (the card is centred on `left`), so edge cells don't push it off-screen.
    const half = Math.min(128, box.width / 2);
    const cx = Math.max(half, Math.min(box.width - half, r.left + r.width / 2 - box.left));
    enter({
      row,
      col,
      left: (cx / box.width) * 100,
      top: ((r.top - box.top) / box.height) * 100,
    });
  };

  const sections: string[] = [];
  for (const r of rows) if (!sections.includes(r.section)) sections.push(r.section);

  const copyRows = rows.map((r) => {
    const def = METRIC[r.key];
    return [
      label(def),
      ...r.cells.map((c) => {
        const v = display(def, c, mode);
        return c.rank != null ? `${v} (${ordinal(c.rank, locale, c.tied)})` : v;
      }),
    ];
  });

  const tipRow = last ? rows[last.row] : null;
  const tipCell = tipRow && last ? tipRow.cells[last.col] : null;
  const tipDef = tipRow ? METRIC[tipRow.key] : null;

  return (
    <div ref={wrap} className="relative">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <ScorecardFrame seedKey={`${seedKey}-mode`} variant="control" className="w-fit text-xs">
          <div role="radiogroup" aria-label={t("modeLabel")} className="relative z-10 flex p-1">
            {(["value", "vsMlb"] as Mode[]).map((m) => {
              const active = m === mode;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setMode(m)}
                  className={`relative px-3 py-1 font-medium transition-colors ${
                    active ? "text-papaya" : "text-navy/65 hover:text-navy"
                  }`}
                >
                  {active && <SlidingPill group={`${seedKey}-mode`} />}
                  <span className="relative z-10">{t(m === "value" ? "modeValue" : "modeVsMlb")}</span>
                </button>
              );
            })}
          </div>
        </ScorecardFrame>
        <TableExport
          headers={[copyName, ...seasons]}
          rows={copyRows}
          name={`${copyName} ${seasons[0]} ${seasons[seasons.length - 1]} ${mode}`}
          caption={[
            seasons.length ? t("title", { from: seasons[0], to: seasons[seasons.length - 1] }) : "",
            copyName,
            t(mode === "value" ? "modeValue" : "modeVsMlb"),
          ]
            .filter(Boolean)
            .join(" · ")}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap border-separate border-spacing-0 text-right text-sm tabular-nums">
          <thead>
            <tr className={HEAD_ROW}>
              <th className={`${TH_FIRST} sticky left-0 z-[1] bg-navy`}>{t("colMetric")}</th>
              {seasons.map((s, i) => (
                <th key={s} className={i === seasons.length - 1 ? TH_LAST : TH}>
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => (
              <Fragment key={section}>
                <tr>
                  <td
                    colSpan={seasons.length + 1}
                    className="pb-1 pl-3 pt-3 text-left font-display text-[11px] uppercase tracking-wider text-navy/55"
                  >
                    {t(`sections.${section}`)}
                  </td>
                </tr>
                {rows.map((r, ri) => {
                  if (r.section !== section) return null;
                  const def = METRIC[r.key];
                  return (
                    <tr key={r.key} className="text-navy">
                      <td className="sticky left-0 z-[1] border-b border-navy/5 bg-papaya py-1.5 pl-3 pr-3 text-left font-medium">
                        {label(def)}
                      </td>
                      {r.cells.map((c, ci) => {
                        const active = hovered?.row === ri && hovered?.col === ci;
                        const v = display(def, c, mode);
                        const rankText = c.rank != null ? ordinal(c.rank, locale, c.tied) : null;
                        return (
                          <td
                            key={c.season}
                            tabIndex={0}
                            aria-label={`${label(def)} ${c.season}: ${v}${rankText ? `, ${t("tipRank", { rank: rankText })}` : ""}, ${t("tipMlbAvg", { value: formatMetric(c.mlb, def.format) })}`}
                            onMouseEnter={(e) => open(e.currentTarget, ri, ci)}
                            onMouseLeave={leave}
                            onFocus={(e) => open(e.currentTarget, ri, ci)}
                            onBlur={leave}
                            className={`cursor-default border-b border-navy/5 px-2 py-1 outline-none transition-shadow focus-visible:shadow-[inset_0_0_0_2px_var(--color-steel)] ${
                              active ? "shadow-[inset_0_0_0_1px_var(--color-navy)]" : ""
                            }`}
                            style={{ background: c.rank != null ? rankTint(c.rank) : undefined }}
                          >
                            <div className="font-semibold">{v}</div>
                            <div className="text-[10px] leading-tight text-navy/55">{rankText ?? " "}</div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-navy/55">
        {mode === "value" ? t("gridNote") : t("vsMlbNote")}
      </p>

      <ChartTooltip open={hovered != null} left={last?.left ?? 0} top={last?.top ?? 0}>
        {tipDef && tipCell && (
          <div className="w-max max-w-[16rem] space-y-0.5 text-navy">
            <div className="font-semibold">
              {label(tipDef)} · {tipCell.season}
            </div>
            <div>
              {formatMetric(tipCell.value, tipDef.format)}
              {tipCell.rank != null && (
                <span className="text-navy/60"> — {t("tipRank", { rank: ordinal(tipCell.rank, locale, tipCell.tied) })}</span>
              )}
            </div>
            {tipCell.raw && <div className="text-navy/60">{t(`raw.${tipCell.raw.unit}`, { n: tipCell.raw.n })}</div>}
            <div className="text-navy/60">{t("tipMlbAvg", { value: formatMetric(tipCell.mlb, tipDef.format) })}</div>
            {tipCell.leader && tipCell.leader.teamId === TORONTO_TEAM_ID && (
              <div className="font-medium text-brick">{t("tipLedMlb")}</div>
            )}
            {tipCell.leader && tipCell.leader.teamId !== TORONTO_TEAM_ID && (
              <div className="flex items-center gap-1.5 text-navy/70">
                <TeamLogo teamId={tipCell.leader.teamId} teamName={tipCell.leader.teamName} size={16} />
                {t("tipLeader", {
                  team: tipCell.leader.abbrev,
                  value: formatMetric(tipCell.leader.value, tipDef.format),
                })}
              </div>
            )}
            <div className="whitespace-normal pt-0.5 text-[11px] leading-snug text-navy/55">{t(`hints.${tipDef.key}`)}</div>
          </div>
        )}
      </ChartTooltip>
    </div>
  );
}
