// Rank / finish ordinals, shared by the season page (division finish) and the
// P13 team page (MLB ranks). English "1st / 2nd / 23rd", "T-3rd" when tied;
// zh-TW 「第 1 名」「並列第 3 名」.

export function ordinal(n: number, locale: string, tied = false): string {
  if (locale.startsWith("zh")) return `${tied ? "並列" : ""}第 ${n} 名`;
  const s =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${tied ? "T-" : ""}${n}${s}`;
}
