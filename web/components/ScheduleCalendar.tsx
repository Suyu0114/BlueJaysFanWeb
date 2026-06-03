"use client";

import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ScheduleGame } from "@/lib/games";
import { teamAbbr } from "@/lib/team-abbr";

type Props = {
  games: ScheduleGame[];
  highlightDate: string | null; // 'YYYY-MM-DD' of the current / most-recent game day
  season: number;
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
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

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-navy">{t("title")}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMonth((m) => Math.max(minMonth, m - 1))}
            disabled={month <= minMonth}
            aria-label={t("prevMonth")}
            className="rounded-md px-2 py-1 text-navy/70 transition-colors hover:bg-navy/10 disabled:opacity-30"
          >
            ‹
          </button>
          <span className="min-w-[9rem] text-center text-sm font-medium text-navy">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => setMonth((m) => Math.min(maxMonth, m + 1))}
            disabled={month >= maxMonth}
            aria-label={t("nextMonth")}
            className="rounded-md px-2 py-1 text-navy/70 transition-colors hover:bg-navy/10 disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-navy/10 bg-papaya text-xs">
        {weekdays.map((w, i) => (
          <div
            key={i}
            className="bg-papaya py-1.5 text-center font-medium uppercase tracking-wide text-navy/50"
          >
            {w}
          </div>
        ))}

        {weeks.flat().map((date, i) => {
          if (date === null) {
            return <div key={i} className="min-h-[64px] bg-papaya" />;
          }
          const dayNum = Number(date.slice(8, 10));
          const dayGames = byDate.get(date) ?? [];
          const isHighlight = date === highlightDate;
          return (
            <div
              key={i}
              className={`min-h-[64px] bg-papaya p-1 ${
                isHighlight ? "ring-2 ring-inset ring-brick" : ""
              }`}
            >
              <div className="text-right text-[10px] text-navy/40">{dayNum}</div>
              <div className="space-y-0.5">
                {dayGames.map((g) => (
                  <GameCell key={g.game_pk} game={g} t={t} />
                ))}
              </div>
            </div>
          );
        })}
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
        className="block rounded bg-papaya px-1 py-0.5 leading-tight transition-colors hover:bg-steel/15"
      >
        <div className="font-medium text-navy">{head}</div>
        <div className={won ? "text-steel" : "text-brick"}>
          {g.result} {g.jays_score}-{g.opp_score}
        </div>
      </Link>
    );
  }

  const key = abnormalStatusKey(g.status);
  const sub = key ? t(key) : g.first_pitch_et ?? t("tbd");
  return (
    <div
      title={title}
      className="rounded bg-papaya px-1 py-0.5 leading-tight text-navy/60"
    >
      <div className="font-medium text-navy/80">{head}</div>
      <div>{sub}</div>
    </div>
  );
}
