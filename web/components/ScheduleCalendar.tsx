"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { AnimatePresence, motion, useInView, type Variants } from "motion/react";
import rough from "roughjs";
import { Link } from "@/i18n/navigation";
import { inkify } from "@/lib/ink-draw";
import { DUR, EASE_SOFT } from "@/lib/motion";
import type { ScheduleGame } from "@/lib/games";
import { teamAbbr } from "@/lib/team-abbr";

type Props = {
  games: ScheduleGame[];
  highlightDate: string | null; // 'YYYY-MM-DD' of the current / most-recent game day
  season: number;
};

// rough.js paints to raw SVG and needs literal color strings, so these mirror
// the @theme brand tokens in app/globals.css (papaya / navy / steel).
const NAVY = "#003049";
const STEEL = "#669bbc"; // "today" accent — deliberately not brick/grass (those mean loss/win)
const PAPAYA = "#fdf0d5";
const INK_FAINT = "rgba(0, 48, 73, 0.28)"; // faint navy inset rule on the parchment panel

const SVGNS = "http://www.w3.org/2000/svg";

// Month label slides in the direction of travel (custom = -1 prev / +1 next).
const labelVariants: Variants = {
  enter: (dir: number) => ({ x: dir * 24, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: DUR.enter, ease: EASE_SOFT } },
  exit: (dir: number) => ({
    x: dir * -24,
    opacity: 0,
    transition: { duration: DUR.exit, ease: EASE_SOFT },
  }),
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// Stable per-date seed so the hand-drawn wobble is identical across redraws
// (resize / month change) instead of shimmering on every paint.
function seedFromDate(d: string): number {
  let h = 0;
  for (let i = 0; i < d.length; i++) h = (h * 31 + d.charCodeAt(i)) >>> 0;
  return h % 100000;
}

// Weeks (Sun..Sat) of `month` (1-12). Cells are 'YYYY-MM-DD' or null (padding /
// off-grid). Dates are built as strings to match the SQL 'YYYY-MM-DD' keys
// exactly -- no Date.toISOString() which would shift across timezones.
function buildMonthGrid(year: number, month: number): (string | null)[][] {
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${pad2(month)}-${pad2(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// Map an abnormal MLB status to a translation key; null = normal (show time).
function abnormalStatusKey(status: string): string | null {
  const s = status.toLowerCase();
  if (s.includes("postpon")) return "postponed";
  if (s.includes("suspend")) return "suspended";
  if (s.includes("cancel")) return "canceled";
  if (s.includes("delay")) return "delayed";
  if (s.includes("progress")) return "live";
  return null;
}

export default function ScheduleCalendar({ games, highlightDate, season }: Props) {
  const t = useTranslations("Calendar");
  const format = useFormatter();

  const byDate = useMemo(() => {
    const m = new Map<string, ScheduleGame[]>();
    for (const g of games) {
      const arr = m.get(g.game_date);
      if (arr) arr.push(g);
      else m.set(g.game_date, [g]);
    }
    return m;
  }, [games]);

  const monthsWithGames = useMemo(() => {
    const s = new Set<number>();
    for (const g of games) s.add(Number(g.game_date.slice(5, 7)));
    return [...s].sort((a, b) => a - b);
  }, [games]);

  const initialMonth = useMemo(() => {
    const fromHighlight = highlightDate ? Number(highlightDate.slice(5, 7)) : null;
    if (fromHighlight && monthsWithGames.includes(fromHighlight)) return fromHighlight;
    return monthsWithGames[0] ?? new Date().getMonth() + 1;
  }, [highlightDate, monthsWithGames]);

  const [month, setMonth] = useState(initialMonth);
  const [dir, setDir] = useState(0);
  const goMonth = (step: -1 | 1) => {
    setDir(step);
    setMonth((m) => Math.min(maxMonth, Math.max(minMonth, m + step)));
  };

  const minMonth = monthsWithGames[0] ?? month;
  const maxMonth = monthsWithGames[monthsWithGames.length - 1] ?? month;

  const weeks = useMemo(() => buildMonthGrid(season, month), [season, month]);

  // Sunday-first weekday short labels (Jan 1 2023 was a Sunday).
  const weekdays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, d) =>
        format.dateTime(new Date(2023, 0, 1 + d), { weekday: "short" }),
      ),
    [format],
  );

  const monthLabel = format.dateTime(new Date(season, month - 1, 1), {
    month: "long",
    year: "numeric",
  });

  // --- rough.js hand-drawn overlay -----------------------------------------
  // The CSS grid below owns layout + content (and is the no-JS fallback). One
  // absolutely-positioned SVG sits behind it (-z-10) and draws the scorecard
  // frame + a filled box behind every game-day cell, measured from the live DOM
  // so it stays aligned when the grid reflows.
  const panelRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const cellEls = useRef(new Map<string, HTMLDivElement>());
  // Ink entrance (lib/ink-draw.ts): the frame sketches in once, when the panel
  // first scrolls into view; the game-day boxes re-sketch on every month
  // change. Resize redraws paint instantly.
  const inView = useInView(panelRef, { once: true, amount: 0.15 });
  const frameInkedRef = useRef(false);
  const inkedMonthRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const svg = svgRef.current;
    if (!panel || !svg) return;

    let raf = 0;
    // ResizeObserver fires once on observe() — a frame AFTER the first draw.
    // Redrawing then would wipe the ink animation that draw just started, so
    // only repaint when the size actually changed (month / highlight changes
    // re-run this whole effect, which resets these).
    let lastW = -1;
    let lastH = -1;
    const draw = () => {
      const w = panel.clientWidth;
      const h = panel.clientHeight;
      if (w === 0 || h === 0) return;
      if (w === lastW && h === lastH) return;
      lastW = w;
      lastH = h;
      svg.setAttribute("width", String(w));
      svg.setAttribute("height", String(h));
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const rc = rough.svg(svg);

      // Double-line scorecard frame: navy outer + a faint navy inner rule.
      const inset = 5;
      const outer = rc.rectangle(inset, inset, w - 2 * inset, h - 2 * inset, {
        stroke: NAVY,
        strokeWidth: 2.5,
        roughness: 1.4,
        seed: 11,
      });
      const inset2 = inset + 4;
      const inner = rc.rectangle(inset2, inset2, w - 2 * inset2, h - 2 * inset2, {
        stroke: INK_FAINT,
        strokeWidth: 1,
        roughness: 2,
        seed: 12,
      });
      svg.appendChild(outer);
      svg.appendChild(inner);

      // Filled "stamp" behind each game day; highlight day gets a thicker brick
      // edge. Date order = grid reading order, which the ink stagger follows.
      const boxes = document.createElementNS(SVGNS, "g");
      const cells = [...cellEls.current].sort(([a], [b]) => (a < b ? -1 : 1));
      for (const [date, el] of cells) {
        const isHi = date === highlightDate;
        const p = 2.5;
        boxes.appendChild(
          rc.rectangle(
            el.offsetLeft + p,
            el.offsetTop + p,
            el.offsetWidth - 2 * p,
            el.offsetHeight - 2 * p,
            {
              stroke: isHi ? STEEL : NAVY,
              strokeWidth: isHi ? 2.6 : 1.4,
              roughness: 1.6,
              fill: PAPAYA,
              fillStyle: "solid",
              seed: seedFromDate(date),
            },
          ),
        );
      }
      svg.appendChild(boxes);

      if (!inView) {
        svg.classList.add("ink-pending");
        return;
      }
      svg.classList.remove("ink-pending");
      let boxDelay = 0;
      if (!frameInkedRef.current) {
        inkify(outer, { step: 60 });
        inkify(inner, { delay: 200, step: 60 });
        frameInkedRef.current = true;
        boxDelay = 350;
      }
      if (inkedMonthRef.current !== month) {
        inkedMonthRef.current = month;
        Array.from(boxes.children).forEach((box, k) =>
          inkify(box, { delay: boxDelay + k * 25, step: 30, dur: 260 }),
        );
      }
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };
    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(panel);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [weeks, month, highlightDate, byDate, inView]);

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl uppercase tracking-wide text-navy">
          {t("title")}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => goMonth(-1)}
            disabled={month <= minMonth}
            aria-label={t("prevMonth")}
            className="rounded-md px-2 py-1 text-navy/70 transition-colors hover:bg-navy/10 disabled:opacity-30"
          >
            ‹
          </button>
          <span className="relative min-w-[9rem] text-center font-display text-base uppercase tracking-wide text-navy">
            <AnimatePresence mode="popLayout" initial={false} custom={dir}>
              <motion.span
                key={month}
                custom={dir}
                variants={labelVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="inline-block"
              >
                {monthLabel}
              </motion.span>
            </AnimatePresence>
          </span>
          <button
            type="button"
            onClick={() => goMonth(1)}
            disabled={month >= maxMonth}
            aria-label={t("nextMonth")}
            className="rounded-md px-2 py-1 text-navy/70 transition-colors hover:bg-navy/10 disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </div>

      <div
        ref={panelRef}
        className="relative isolate rounded-lg bg-dirt/40 p-2 shadow-[5px_5px_0_0_#00304933] sm:p-3"
      >
        <svg
          ref={svgRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
        />

        <div className="grid grid-cols-7 overflow-hidden rounded-md bg-navy text-papaya">
          {weekdays.map((w, i) => (
            <div
              key={i}
              className="py-2 text-center font-display text-xs uppercase tracking-wider"
            >
              {w}
            </div>
          ))}
        </div>

        {/* Keyed by month so the day contents fade in on a month change. Opacity
            only: the ink boxes behind are measured at the cells' final
            positions, so any slide would pull text and boxes apart. */}
        <div key={month} className="fade-in grid grid-cols-7">
          {weeks.flat().map((date, i) => {
            if (date === null) {
              return <div key={i} className="min-h-[76px]" />;
            }
            const dayNum = Number(date.slice(8, 10));
            const dayGames = byDate.get(date) ?? [];
            const hasGame = dayGames.length > 0;
            const isHighlight = date === highlightDate;
            return (
              <div
                key={i}
                ref={
                  hasGame
                    ? (el) => {
                        if (el) cellEls.current.set(date, el);
                        else cellEls.current.delete(date);
                      }
                    : undefined
                }
                className="min-h-[76px] p-2"
              >
                <div className="relative z-10">
                  <div className="flex items-center justify-between">
                    {isHighlight ? (
                      <span className="rounded-sm bg-steel px-1 py-px text-[11px] font-bold uppercase tracking-wide text-papaya">
                        {t("today")}
                      </span>
                    ) : (
                      <span />
                    )}
                    <span
                      className={`font-display text-xs ${
                        hasGame ? "text-navy" : "text-navy/45"
                      }`}
                    >
                      {dayNum}
                    </span>
                  </div>
                  <div className="mt-0.5 space-y-1">
                    {dayGames.map((g) => (
                      <GameCell key={g.game_pk} game={g} t={t} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function GameCell({
  game: g,
  t,
}: {
  game: ScheduleGame;
  t: ReturnType<typeof useTranslations>;
}) {
  const loc = g.is_home ? t("vs") : t("at");
  const abbr = teamAbbr(g.opponent_id, g.opponent_name);
  const head = `${loc} ${abbr}`;
  const title = `${g.is_home ? t("vs") : t("at")} ${g.opponent_name}`;

  if (g.is_final) {
    const won = g.result === "W";
    return (
      <Link
        href={`/games/${g.game_pk}`}
        title={title}
        className="group block rounded leading-tight transition-colors hover:bg-navy/5"
      >
        <div className="font-mono text-xs font-semibold text-navy">{head}</div>
        <span
          className={`mt-0.5 inline-block rounded-sm px-1 py-px font-mono text-[11px] font-bold tabular-nums text-papaya transition-transform group-hover:-translate-y-px group-hover:scale-110 ${
            won ? "bg-grass" : "bg-brick"
          }`}
        >
          {g.result} {g.jays_score}-{g.opp_score}
        </span>
      </Link>
    );
  }

  const key = abnormalStatusKey(g.status);
  const sub = key ? t(key) : g.first_pitch_et ?? t("tbd");
  return (
    <div title={title} className="leading-tight">
      <div className="font-mono text-sm font-semibold text-navy/85">{head}</div>
      <div
        className={`font-mono text-sm tabular-nums ${
          key ? "font-medium text-lava" : "text-navy/80"
        }`}
      >
        {sub}
      </div>
    </div>
  );
}
