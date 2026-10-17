import type { NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { CARD_SIZES, renderShareCard, type CardSize } from "@/lib/share-card/card";
import { CARD_KINDS, loadCardSpec } from "@/lib/share-card/spec";
import type { CardKind } from "@/lib/share-card/tokens";

// DEV ONLY: renders a share card PNG for a committed spec, for the /share-card
// skill to save and post. GET ?kind=glossary&slug=wrc-plus&size=ig&locale=zh-TW
// (+ &part=N for kind=part: the article's Nth series part).
// 404 outside `next dev`: on the live site this would let anyone mint images in
// the site's branding. Specs are read only from content/ (article registry or
// content/cards/<kind>/<slug>.json), never from the request.
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") return new Response("Not found", { status: 404 });

  const p = req.nextUrl.searchParams;
  const kind = p.get("kind") as CardKind | null;
  const slug = p.get("slug") ?? "";
  const size = (p.get("size") ?? "og") as CardSize;
  const locale = p.get("locale") ?? "en";
  const part = Number(p.get("part") ?? 0);
  if (!kind || !CARD_KINDS.includes(kind) || !(size in CARD_SIZES) || !(routing.locales as readonly string[]).includes(locale) || (kind === "part" && !(Number.isInteger(part) && part >= 1))) {
    return new Response("Bad request: kind, size (og | x | ig) and locale (en | zh-TW) are required; kind=part also needs part=N", { status: 400 });
  }
  const spec = await loadCardSpec(kind, slug, part || undefined);
  if (!spec) return new Response(`No ${kind} card spec for "${slug}"${kind === "part" ? ` part ${part}` : ""}`, { status: 404 });
  return renderShareCard(spec, { size, locale });
}
