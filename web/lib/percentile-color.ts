// One "good vs bad" colour scale for the whole site: Savant's blue -> grey -> red,
// so 50 reads as "average". Built from brand tokens only — steel -> a neutral
// (navy washed into papaya) -> brick — via CSS color-mix, so no new hex.
// Used by the P12 percentile bars and the P13 30-club rank shading.

const NEUTRAL = "color-mix(in srgb, var(--color-navy) 28%, var(--color-papaya))";

/** 0 = worst (full steel), 50 = neutral, 100 = best (full brick). */
export function percentileColor(v: number): string {
  const p = Math.max(0, Math.min(100, v));
  return p <= 50
    ? `color-mix(in srgb, var(--color-steel) ${100 - 2 * p}%, ${NEUTRAL})`
    : `color-mix(in srgb, var(--color-brick) ${2 * p - 100}%, ${NEUTRAL})`;
}

/** A rank among `of` clubs on the same scale: 1st = 100, last = 0. */
export function rankPercentile(rank: number, of = 30): number {
  return of <= 1 ? 50 : (100 * (of - rank)) / (of - 1);
}

/**
 * A light cell tint for a rank, for table backgrounds under navy text: the
 * percentile colour at `strength` % over papaya. Mid ranks fade to almost
 * nothing, so only real strengths and weaknesses stand out.
 */
export function rankTint(rank: number, of = 30, strength = 45): string {
  const p = rankPercentile(rank, of);
  const weight = Math.round((Math.abs(p - 50) / 50) * strength);
  return `color-mix(in srgb, ${percentileColor(p)} ${weight}%, var(--color-papaya))`;
}
