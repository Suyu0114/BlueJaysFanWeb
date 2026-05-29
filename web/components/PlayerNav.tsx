import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export type PlayerSection = "batting" | "pitching" | "fielding";

export default async function PlayerNav({
  mlbamId,
  active,
}: {
  mlbamId: number;
  active: PlayerSection;
}) {
  const t = await getTranslations("PlayerNav");
  const items: { key: PlayerSection; label: string }[] = [
    { key: "batting", label: t("batting") },
    { key: "pitching", label: t("pitching") },
    { key: "fielding", label: t("fielding") },
  ];

  return (
    <nav className="mb-4 flex gap-1 border-b border-navy/15 text-sm">
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={`/players/${mlbamId}/${item.key}`}
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-1.5 font-medium transition-colors ${
              isActive
                ? "border-brick text-navy"
                : "border-transparent text-navy/55 hover:text-navy"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
