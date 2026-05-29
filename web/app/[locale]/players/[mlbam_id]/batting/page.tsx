import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import SprayChartExplorer from "@/components/charts/SprayChartExplorer";
import { getBattedBalls } from "@/lib/batting";
import { getPlayer } from "@/lib/players";

export default async function BattingPage({
  params,
}: {
  params: Promise<{ locale: string; mlbam_id: string }>;
}) {
  const { locale, mlbam_id } = await params;
  setRequestLocale(locale);

  const batterId = Number(mlbam_id);
  if (!Number.isFinite(batterId)) notFound();

  const t = await getTranslations("Batting");
  const [player, events] = await Promise.all([
    getPlayer(batterId),
    getBattedBalls(batterId),
  ]);

  if (!player) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm text-navy/60">{player.name}</p>
      <h1 className="text-2xl font-semibold tracking-tight">
        {t("sprayChart")}
      </h1>
      <p className="mt-1 text-sm text-navy/60">
        {t("subtitle")}
      </p>

      <div className="mt-6">
        {events.length === 0 ? (
          <p className="text-navy/60">{t("noData")}</p>
        ) : (
          <SprayChartExplorer events={events} />
        )}
      </div>
    </div>
  );
}
