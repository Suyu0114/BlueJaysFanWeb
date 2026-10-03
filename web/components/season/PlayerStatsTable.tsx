"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import CopyTableButton from "@/components/CopyTableButton";
import ScorecardFrame from "@/components/ScorecardFrame";
import SlidingPill from "@/components/motion/SlidingPill";
import { HEAD_ROW, stripeBg, TD, TD_LAST, TH, TH_FIRST, TH_LAST } from "@/components/standings-chrome";
import {
  HITTER_COLUMNS,
  isRegular,
  LEADER_ANCHORS,
  PITCHER_COLUMNS,
  RATE_KEYS,
  REGULAR_MIN_IP,
  REGULAR_MIN_PA,
  sortRows,
  type Column,
  type HitterRow,
  type PitcherRow,
  type SortDir,
  type StatsTab as Tab,
} from "@/lib/season-player-stats";

// Season page: every Blue Jay's season line, sortable, position players
// (offense | defense) and pitchers as tabs. Leader cards link here with
// #stats-<tab>-<column> — a hashchange switches the tab and sorts by that
// column; the matching empty anchors below make the jump work without JS too.
// An MLB-average row (rate columns, from the 022 MLB row) is pinned in <tfoot>,
// outside sorting and the Regulars filter.
// No JS: both tables show (the layout's <noscript> rule un-hides
// [data-tabpanel] / [data-nojs-label]; class `hidden`, not the attribute, which
// Tailwind's preflight pins with a layered !important).

type Sort = { key: string; dir: SortDir };
const TABS: Tab[] = ["hitters", "pitchers"];
const DEFAULT_SORT: Sort = { key: "war", dir: "desc" };
const CENTERED = new Set<string>(["pos", "role"]);

const columnsOf = (tab: Tab) => (tab === "hitters" ? HITTER_COLUMNS : PITCHER_COLUMNS) as Column<HitterRow | PitcherRow>[];

/** The MLB-average reference row, rate columns only (from the 022 MLB row). */
export type MlbReference = { hitters: Partial<HitterRow>; pitchers: Partial<PitcherRow> };

export default function PlayerStatsTable({
  hitters,
  pitchers,
  season,
  mlbRef,
}: {
  hitters: HitterRow[];
  pitchers: PitcherRow[];
  season: number;
  mlbRef: MlbReference | null; // pinned under the rows, outside sort / filter
}) {
  const t = useTranslations("Season");
  const [tab, setTab] = useState<Tab>("hitters");
  const [regulars, setRegulars] = useState(false);
  const [sorts, setSorts] = useState<Record<Tab, Sort>>({ hitters: DEFAULT_SORT, pitchers: DEFAULT_SORT });

  // #stats-<tab>-<column> (a leader card's "All →", or a shared link) picks the
  // tab and sorts by that column's better end (rate stats: Regulars only). Read once after mount (in a
  // frame, not synchronously in the effect) and on every hashchange.
  useEffect(() => {
    const apply = () => {
      const m = /^#stats-(hitters|pitchers)-([a-z_]+)$/.exec(window.location.hash);
      if (!m) return;
      const next = m[1] as Tab;
      const col = columnsOf(next).find((c) => c.key === m[2]);
      if (!col) return;
      setTab(next);
      setSorts((s) => ({ ...s, [next]: { key: col.key, dir: col.first } }));
      if (RATE_KEYS.has(col.key)) setRegulars(true);
    };
    const raf = requestAnimationFrame(apply);
    window.addEventListener("hashchange", apply);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("hashchange", apply);
    };
  }, []);

  const label = (c: Column<HitterRow | PitcherRow>) => (c.labelKey ? t(c.labelKey) : (c.label ?? c.key));
  const tabLabel = (x: Tab) => (x === "hitters" ? t("tabHitters") : t("tabPitchers"));

  const visible = (x: Tab) => {
    const rows = (x === "hitters" ? hitters : pitchers) as (HitterRow | PitcherRow)[];
    const regular = (r: HitterRow | PitcherRow) =>
      x === "hitters" ? isRegular.hitters(r as HitterRow) : isRegular.pitchers(r as PitcherRow);
    const kept = regulars ? rows.filter(regular) : rows;
    const { key, dir } = sorts[x];
    return { rows: sortRows(kept, key as keyof (HitterRow | PitcherRow) & string, dir), regular };
  };

  const onSort = (x: Tab, c: Column<HitterRow | PitcherRow>) =>
    setSorts((s) => ({
      ...s,
      [x]: s[x].key === c.key ? { key: c.key, dir: s[x].dir === "asc" ? "desc" : "asc" } : { key: c.key, dir: c.first },
    }));

  const current = visible(tab);
  const currentCols = columnsOf(tab);
  const copyHeaders = currentCols.map(label);
  // The MLB-average row's cells: a value only where the reference has that column.
  const refCells = (x: Tab) => {
    const ref = mlbRef?.[x] as Record<string, unknown> | undefined;
    return columnsOf(x).map((c, j) =>
      j === 0 ? t("mlbAvgRow") : ref && c.key in ref && ref[c.key] != null ? c.format(ref[c.key]) : "",
    );
  };
  const copyRows = [
    ...current.rows.map((r) => currentCols.map((c) => c.format(r[c.key as keyof typeof r]))),
    ...(mlbRef ? [refCells(tab)] : []),
  ];

  const toggle = (
    group: string,
    aria: string,
    options: { key: string; label: string; active: boolean; onClick: () => void; controls?: string }[],
    asTabs = false,
  ) => (
    <ScorecardFrame seedKey={`player-stats-${group}`} variant="control" className="text-xs">
      <div role={asTabs ? "tablist" : "group"} aria-label={aria} className="relative z-10 flex p-1">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={o.onClick}
            {...(asTabs
              ? { role: "tab", "aria-selected": o.active, "aria-controls": o.controls }
              : { "aria-pressed": o.active })}
            className={`relative px-3 py-1 font-medium transition-colors ${o.active ? "text-papaya" : "text-navy/65 hover:text-navy"}`}
          >
            {o.active && <SlidingPill group={`player-stats-${group}`} />}
            <span className="relative z-10">{o.label}</span>
          </button>
        ))}
      </div>
    </ScorecardFrame>
  );

  const table = (x: Tab) => {
    const cols = columnsOf(x);
    const { rows, regular } = visible(x);
    const sort = sorts[x];
    const groups = x === "hitters" ? groupSpans(cols) : null;
    const last = cols.length - 1;
    return (
      <div
        key={x}
        id={`player-stats-${x}`}
        role="tabpanel"
        aria-label={tabLabel(x)}
        data-tabpanel
        className={x === tab ? "" : "hidden"}
      >
        <h3 data-nojs-label className="hidden pb-1 text-sm font-semibold text-navy">
          {tabLabel(x)}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap border-separate border-spacing-0 text-right text-sm tabular-nums">
            <thead>
              {groups && (
                <tr className="text-[11px] text-navy/55">
                  {groups.map((g, i) => (
                    <th
                      key={i}
                      colSpan={g.span}
                      className={g.group ? "border-b border-navy/15 pb-1 text-center font-display font-normal uppercase tracking-wider" : ""}
                    >
                      {g.group === "offense" ? t("groupOffense") : g.group === "defense" ? t("groupDefense") : null}
                    </th>
                  ))}
                </tr>
              )}
              <tr className={HEAD_ROW}>
                {cols.map((c, i) => {
                  const active = sort.key === c.key;
                  const base = i === 0 ? `${TH_FIRST} sticky left-0 z-[1] bg-navy` : i === last ? TH_LAST : TH;
                  return (
                    <th
                      key={c.key}
                      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                      className={`${base} ${i === 0 ? "" : CENTERED.has(c.key) ? "text-center" : "text-right"}`}
                    >
                      <button
                        type="button"
                        onClick={() => onSort(x, c)}
                        title={t("sortBy", { column: label(c) })}
                        className={`inline-flex items-center gap-0.5 uppercase transition-colors hover:text-steel ${active ? "text-papaya" : "text-papaya/80"}`}
                      >
                        {label(c)}
                        <span aria-hidden className={`text-[9px] ${active ? "" : "opacity-0"}`}>
                          {active && sort.dir === "asc" ? "▴" : "▾"}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.mlbam_id} className={`${stripeBg(i)} ${regulars || regular(r) ? "" : "text-navy/50"}`}>
                  {cols.map((c, j) => {
                    const value = c.format(r[c.key as keyof typeof r]);
                    const tint = sort.key === c.key ? "bg-steel/10" : "";
                    if (j === 0) {
                      return (
                        <td key={c.key} className="sticky left-0 z-[1] bg-papaya py-1.5 pl-3 pr-2 text-left">
                          <Link href={`/players/${r.mlbam_id}`} className="transition-colors hover:text-brick">
                            {value}
                          </Link>
                        </td>
                      );
                    }
                    return (
                      <td key={c.key} className={`${j === last ? TD_LAST : TD} ${CENTERED.has(c.key) ? "text-center" : ""} ${tint}`}>
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            {mlbRef && (
              <tfoot>
                <tr>
                  {refCells(x).map((v, j) => (
                    <td
                      key={cols[j].key}
                      className={
                        j === 0
                          ? "sticky left-0 z-[1] border-t-2 border-navy/25 bg-papaya py-1.5 pl-3 pr-2 text-left font-display text-[11px] uppercase tracking-wider text-navy/70"
                          : `${j === last ? TD_LAST : TD} border-t-2 border-navy/25 bg-navy/5 text-navy/70 ${CENTERED.has(cols[j].key) ? "text-center" : ""}`
                      }
                    >
                      {v}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Jump targets for the leader cards' "All →" links (see LEADER_ANCHORS). */}
      {Object.values(LEADER_ANCHORS).map((id) => (
        <span key={id} id={id} className="block scroll-mt-4" aria-hidden />
      ))}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {toggle(
          "tab",
          t("statsTabsLabel"),
          TABS.map((x) => ({
            key: x,
            label: tabLabel(x),
            active: tab === x,
            onClick: () => setTab(x),
            controls: `player-stats-${x}`,
          })),
          true,
        )}
        {toggle("filter", t("filterLabel"), [
          { key: "all", label: t("filterAll"), active: !regulars, onClick: () => setRegulars(false) },
          {
            key: "regulars",
            label:
              tab === "hitters"
                ? t("filterRegularsHitters", { pa: REGULAR_MIN_PA })
                : t("filterRegularsPitchers", { ip: REGULAR_MIN_IP }),
            active: regulars,
            onClick: () => setRegulars(true),
          },
        ])}
        <div className="ml-auto">
          <CopyTableButton headers={copyHeaders} rows={copyRows} />
        </div>
      </div>
      {TABS.map(table)}
      <p className="sr-only" aria-live="polite">
        {t("statsCount", { season, n: current.rows.length, tab: tabLabel(tab) })}
      </p>
    </div>
  );
}

/** Consecutive columns sharing a group -> one header cell spanning them. */
function groupSpans<R>(cols: Column<R>[]): { group: Column<R>["group"]; span: number }[] {
  const out: { group: Column<R>["group"]; span: number }[] = [];
  for (const c of cols) {
    const prev = out[out.length - 1];
    if (prev && prev.group === c.group) prev.span++;
    else out.push({ group: c.group, span: 1 });
  }
  return out;
}
