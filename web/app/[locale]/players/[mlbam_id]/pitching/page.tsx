import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import PitchingExplorer from "@/components/charts/PitchingExplorer";
import PlayerNav from "@/components/PlayerNav";
import { Reveal } from "@/components/motion/Reveal";
import { getPitches } from "@/lib/pitching";
import { getPlayer, getPlayerAvailability } from "@/lib/players";

export const revalidate = 86400;

export default async function PitchingPage({
  params,
}: {
  params: Promise<{ locale: string; mlbam_id: string }>;
}) {
  const { locale, mlbam_id } = await params;
  setRequestLocale(locale);

  const pitcherId = Number(mlbam_id);
  if (!Number.isFinite(pitcherId)) notFound();

  const t = await getTranslations("Pitching");
  const [player, pitches, availability] = await Promise.all([
    getPlayer(pitcherId),
    getPitches(pitcherId),
    getPlayerAvailability(pitcherId),
  ]);

  if (!player) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Reveal>
        <p className="text-sm text-navy/60">{player.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-0.5 text-sm text-navy/60">{t("subtitle")}</p>
      </Reveal>
      <PlayerNav mlbamId={pitcherId} active="pitching" available={availability} />

      <div className="mt-6">
        {pitches.length === 0 ? (
          <p className="text-navy/60">{t("noData")}</p>
        ) : (
          <PitchingExplorer pitches={pitches} />
        )}
      </div>
    </div>
  );
}
