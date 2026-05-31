import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import SprayChartExplorer from "@/components/charts/SprayChartExplorer";
import PlayerNav from "@/components/PlayerNav";
import { getBattedBalls } from "@/lib/batting";
import { getPlayer, getPlayerAvailability } from "@/lib/players";

export const revalidate = 86400;

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
  const [player, events, availability] = await Promise.all([
    getPlayer(batterId),
    getBattedBalls(batterId),
    getPlayerAvailability(batterId),
  ]);

  if (!player) notFound();

  return (
    <div className="mx-auto flex h-[calc(100dvh-64px)] max-w-3xl flex-col px-4 pt-4 pb-2">
      <div className="shrink-0">
        <p className="text-sm text-navy/60">{player.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("sprayChart")}
        </h1>
        <p className="mt-0.5 text-sm text-navy/60">{t("subtitle")}</p>
        <PlayerNav mlbamId={batterId} active="batting" available={availability} />
      </div>

      <div className="mt-3 min-h-0 flex-1">
        {events.length === 0 ? (
          <p className="text-navy/60">{t("noData")}</p>
        ) : (
          <SprayChartExplorer events={events} />
        )}
      </div>
    </div>
  );
}
