import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import FieldingDiagram from "@/components/charts/FieldingDiagram";
import PlayerNav from "@/components/PlayerNav";
import { getFielding } from "@/lib/fielding";
import { getPlayer, getPlayerAvailability } from "@/lib/players";

export const revalidate = 86400;

function formatFrv(v: number | null): string {
  if (v == null) return "—";
  if (v > 0) return `+${v}`;
  return String(v);
}

function frvTone(v: number | null): string {
  if (v == null) return "text-navy/60";
  if (v > 0) return "text-grass";
  if (v < 0) return "text-brick";
  return "text-navy/60";
}

export default async function FieldingPage({
  params,
}: {
  params: Promise<{ locale: string; mlbam_id: string }>;
}) {
  const { locale, mlbam_id } = await params;
  setRequestLocale(locale);

  const playerId = Number(mlbam_id);
  if (!Number.isFinite(playerId)) notFound();

  const t = await getTranslations("Fielding");
  const [player, seasons, availability] = await Promise.all([
    getPlayer(playerId),
    getFielding(playerId),
    getPlayerAvailability(playerId),
  ]);

  if (!player) notFound();

  // Latest season is what the diagram + summary highlight.
  const latestSeason = seasons[0]?.season ?? null;
  const latestRows = latestSeason
    ? seasons.filter((s) => s.season === latestSeason)
    : [];

  // Primary position prefers what the MLB Stats API thinks (web_players.position).
  // Fall back to whichever latest-season row had the most attempts (proxied by
  // absolute OAA — Savant doesn't expose the attempt count directly).
  const primaryPosition =
    (player.position && latestRows.some((r) => r.position === player.position)
      ? player.position
      : null) ??
    [...latestRows]
      .sort((a, b) => Math.abs(b.oaa ?? 0) - Math.abs(a.oaa ?? 0))[0]?.position ??
    null;

  const allPositions = latestRows.map((r) => r.position);
  const secondaryPositions = allPositions.filter((p) => p !== primaryPosition);

  // Plain-language runs-saved line for the latest season.
  const latestFrvSum = latestRows.reduce(
    (acc, r) => acc + (r.frv ?? 0),
    0,
  );
  const runsSavedText =
    latestRows.length > 0
      ? t(latestFrvSum >= 0 ? "runsSavedPlain" : "runsCostPlain", {
          n: Math.abs(latestFrvSum),
          name: player.name,
        })
      : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div>
        <p className="text-sm text-navy/60">{player.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-0.5 text-sm text-navy/60">{t("subtitle")}</p>
        <PlayerNav mlbamId={playerId} active="fielding" available={availability} />
      </div>

      {seasons.length === 0 ? (
        <p className="mt-6 text-navy/60">{t("noData")}</p>
      ) : (
        <div className="mt-6 grid gap-6 md:grid-cols-[1fr_auto] md:items-start">
          <section className="space-y-4">
            {runsSavedText && (
              <p className="text-sm text-navy">{runsSavedText}</p>
            )}

            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-navy/45">
                <tr>
                  <th className="py-1 text-left">{t("colSeason")}</th>
                  <th className="py-1 text-left">{t("colPosition")}</th>
                  <th className="py-1 text-right">FRV</th>
                  <th className="py-1 text-right">OAA</th>
                  <th className="py-1 text-right">vs LHH</th>
                  <th className="py-1 text-right">vs RHH</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy/10">
                {seasons.map((s) => (
                  <tr key={`${s.season}-${s.position}`}>
                    <td className="py-1.5 tabular-nums">{s.season}</td>
                    <td className="py-1.5 font-mono">{s.position}</td>
                    <td
                      className={`py-1.5 text-right font-semibold tabular-nums ${frvTone(s.frv)}`}
                    >
                      {formatFrv(s.frv)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-navy/70">
                      {formatFrv(s.oaa)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-navy/70">
                      {formatFrv(s.oaa_vs_lhh)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-navy/70">
                      {formatFrv(s.oaa_vs_rhh)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="rounded-lg border border-steel/30 bg-white/60 p-4 text-sm leading-relaxed text-navy/80">
              <p className="font-semibold text-navy">{t("explainTitle")}</p>
              <p className="mt-1">{t("explainBody")}</p>
              <p className="mt-2 text-xs text-navy/60">{t("note")}</p>
            </div>
          </section>

          <section className="w-full max-w-[340px] justify-self-center">
            <FieldingDiagram
              positions={allPositions}
              primary={primaryPosition ?? undefined}
            />
            <p className="mt-2 text-center text-xs text-navy/60">
              {primaryPosition && latestSeason
                ? secondaryPositions.length > 0
                  ? t("diagramCaptionMulti", {
                      primary: primaryPosition,
                      season: latestSeason,
                      others: secondaryPositions.join(" / "),
                    })
                  : t("diagramCaption", {
                      position: primaryPosition,
                      season: latestSeason,
                    })
                : t("diagramCaptionGeneric")}
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
