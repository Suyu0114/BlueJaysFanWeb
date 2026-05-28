import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getRoster } from "@/lib/players";

export default async function PlayersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Roster");
  const players = await getRoster();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-1 text-sm text-navy/60">{t("subtitle")}</p>

      {players.length === 0 ? (
        <p className="mt-8 text-zinc-500">{t("empty")}</p>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {players.map((p) => (
            <li
              key={p.mlbam_id}
              className="rounded-xl border border-brick/20 bg-white p-4 transition-shadow hover:border-brick hover:shadow-md"
            >
              {p.headshot_url && (
                <Image
                  src={p.headshot_url}
                  alt={p.name}
                  width={120}
                  height={120}
                  unoptimized
                  className="mx-auto rounded-full bg-papaya"
                />
              )}
              <div className="mt-3 text-center">
                <div className="font-medium text-navy">{p.name}</div>
                <div className="mt-1 text-xs text-navy/60">
                  {p.position}
                  {p.bats && p.throws && (
                    <>
                      {" · "}
                      {t("bats")} {p.bats} / {t("throws")} {p.throws}
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
