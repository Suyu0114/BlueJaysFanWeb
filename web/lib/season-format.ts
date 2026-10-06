import type { Streak, WinLoss } from "@/lib/team-season";

// Display helpers shared by the season page's modules (record strip, month by
// month, splits) and the article figures that reuse those modules.

/** .488 — three decimals, no leading zero; "—" when there is no value. */
export const r3 = (v: number | null) => {
  if (v == null) return "—";
  const s = v.toFixed(3);
  return s.startsWith("0.") ? s.slice(1) : s;
};

/** +77 / −46 / ±0 with a typographic minus. */
export const signed = (v: number, d = 0) =>
  v > 0 ? `+${v.toFixed(d)}` : v < 0 ? `−${Math.abs(v).toFixed(d)}` : `±${(0).toFixed(d)}`;

export const wl = (r: WinLoss) => `${r.w}-${r.l}`;

/** "4 (May 20 – May 23)" — `fmt` is the Season.streakValue message. */
export function streakText(
  s: Streak,
  locale: string,
  fmt: (v: { n: number; from: string; to: string }) => string,
): string {
  if (!s) return "—";
  const day = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" });
  return fmt({
    n: s.length,
    from: day.format(new Date(`${s.start}T00:00:00Z`)),
    to: day.format(new Date(`${s.end}T00:00:00Z`)),
  });
}
