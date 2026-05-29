import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import FieldingDiagram from "@/components/charts/FieldingDiagram";
import PlayerNav from "@/components/PlayerNav";
import { getFielding } from "@/lib/fielding";
import { getPlayer } from "@/lib/players";

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
  const [player, seasons] = await Promise.all([
    getPlayer(playerId),
    getFielding(playerId),
  ]);

  if (!player) notFound();

  const primary = seasons[0] ?? null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div>
        <p className="text-sm text-navy/60">{player.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-0.5 text-sm text-navy/60">{t("subtitle")}</p>
        <PlayerNav mlbamId={playerId} active="fielding" />
      </div>

      {seasons.length === 0 ? (
        <p className="mt-6 text-navy/60">{t("noData")}</p>
      ) : (
        <div className="mt-6 grid gap-6 md:grid-cols-[1fr_auto] md:items-start">
          <section className="space-y-4">
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
            <FieldingDiagram position={primary?.position ?? player.position} />
            <p className="mt-2 text-center text-xs text-navy/60">
              {primary
                ? t("diagramCaption", {
                    position: primary.position,
                    season: primary.season,
                  })
                : t("diagramCaptionGeneric")}
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
