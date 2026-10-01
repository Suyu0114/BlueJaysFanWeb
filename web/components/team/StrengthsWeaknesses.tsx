import { getTranslations } from "next-intl/server";
import CopyTableButton from "@/components/CopyTableButton";
import { RevealGroup, RevealItem } from "@/components/motion/Reveal";
import RankChip from "@/components/team/RankChip";
import { PanelBlock } from "@/components/team/TeamPanel";
import { ordinal } from "@/lib/ordinal";
import { seasonCallouts, type Callout } from "@/lib/team-callouts";
import { formatMetric, METRIC } from "@/lib/team-metrics";
import type { TeamSeasonRow } from "@/lib/team-trends";

// P13 module ⑤: per season, up to three top-10 and three bottom-10 MLB ranks
// among distinct team skills (lib/team-callouts.ts) — the article-ready "what
// defined this team" line. Labels are descriptive ("Bullpen (FIP)") because the
// bare registry labels repeat across sides (Barrel% hit vs allowed).
// `single`: the P12 season page shows one season — strengths and weaknesses
// side by side instead of one narrow card in a five-column row.

export default async function StrengthsWeaknesses({
  seasons,
  clubs,
  locale,
  single = false,
}: {
  seasons: number[]; // oldest -> newest
  clubs: TeamSeasonRow[];
  locale: string;
  single?: boolean;
}) {
  const t = await getTranslations("Team");
  const label = (c: Callout) => t(`calloutLabels.${c.key}`);
  const value = (c: Callout) => formatMetric(c.value, METRIC[c.key].format);
  const bySeason = seasons.map((s) => ({ season: s, ...seasonCallouts(clubs, s) }));

  const copyRows = bySeason.flatMap((s) => [
    ...s.strengths.map((c) => [s.season, t("strengths"), label(c), value(c), ordinal(c.rank, locale, c.tied)]),
    ...s.weaknesses.map((c) => [s.season, t("weaknesses"), label(c), value(c), ordinal(c.rank, locale, c.tied)]),
  ]);

  const list = (items: Callout[], empty: string) =>
    items.length === 0 ? (
      <p className="text-[11px] text-navy/45">{empty}</p>
    ) : (
      <ul className="space-y-1">
        {items.map((c) => (
          <li key={c.key} className="flex items-start gap-1.5" title={t(`hints.${c.key}`)}>
            <RankChip rank={c.rank} tied={c.tied} locale={locale} small className="mt-0.5 min-w-[2.9rem]" />
            <span className="leading-snug">
              {label(c)} <span className="tabular-nums text-navy/55">{value(c)}</span>
            </span>
          </li>
        ))}
      </ul>
    );

  const strengthsHead = (
    <div className="text-[10px] font-semibold uppercase tracking-wide text-brick">{t("strengths")}</div>
  );
  // navy, not steel: steel is too low-contrast for text on papaya (CLAUDE.md palette).
  const weaknessesHead = (
    <div className="text-[10px] font-semibold uppercase tracking-wide text-navy/60">{t("weaknesses")}</div>
  );
  const card = "rounded-md border border-navy/10 bg-papaya/50 p-3 text-xs text-navy";

  return (
    <PanelBlock
      title={single ? t("calloutsTitleSingle") : t("calloutsTitle")}
      action={
        <CopyTableButton
          headers={[t("colSeason"), t("colSide"), t("colMetric"), t("colValue"), t("colMlbRank")]}
          rows={copyRows}
        />
      }
      note={t("calloutsNote")}
    >
      {single ? (
        <RevealGroup as="ul" className="grid gap-3 sm:grid-cols-2">
          {bySeason.slice(0, 1).flatMap((s) => [
            <RevealItem as="li" key="strengths" className={card}>
              {strengthsHead}
              <div className="mt-1">{list(s.strengths, t("noStrengths"))}</div>
            </RevealItem>,
            <RevealItem as="li" key="weaknesses" className={card}>
              {weaknessesHead}
              <div className="mt-1">{list(s.weaknesses, t("noWeaknesses"))}</div>
            </RevealItem>,
          ])}
        </RevealGroup>
      ) : (
        <RevealGroup as="ul" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {bySeason.map((s) => (
            <RevealItem as="li" key={s.season} className={card}>
              <div className="font-display text-sm uppercase tracking-wider text-navy">{s.season}</div>
              <div className="mt-2">{strengthsHead}</div>
              <div className="mt-1">{list(s.strengths, t("noStrengths"))}</div>
              <div className="mt-3">{weaknessesHead}</div>
              <div className="mt-1">{list(s.weaknesses, t("noWeaknesses"))}</div>
            </RevealItem>
          ))}
        </RevealGroup>
      )}
    </PanelBlock>
  );
}
