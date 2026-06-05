import Image from "next/image";
import { Link } from "@/i18n/navigation";
import ScorecardFrame from "./ScorecardFrame";

export default function HeroCard({
  href,
  headshot,
  name,
  headline,
}: {
  href: string;
  headshot: string | null;
  name: string;
  headline: string;
}) {
  return (
    <ScorecardFrame seedKey={href}>
      <Link href={href} className="relative z-10 flex items-center gap-3 p-4">
        {headshot && (
          <Image
            src={headshot}
            alt={name}
            width={56}
            height={56}
            unoptimized
            className="rounded-full bg-papaya ring-1 ring-navy/15"
          />
        )}
        <p className="text-sm font-medium leading-snug text-navy">{headline}</p>
      </Link>
    </ScorecardFrame>
  );
}
