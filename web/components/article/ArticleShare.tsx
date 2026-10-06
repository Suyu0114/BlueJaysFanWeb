"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { copyText } from "@/lib/copy-table";
import { xHandle } from "@/lib/site";

// End-of-article share row: post to X (intent URL, credited via the site's
// account), copy the link, and — on phones and other browsers that have one —
// the system share sheet. The URL is the canonical one (SITE.url), never
// window.location, so a link shared from a preview deploy still points home.

const PRIMARY = "rounded-md bg-brick px-3 py-1.5 text-sm font-medium text-papaya transition-colors hover:bg-lava";
const SECONDARY =
  "rounded-md border border-navy/20 bg-papaya/70 px-3 py-1.5 text-sm text-navy transition-colors hover:border-brick hover:text-brick";

const noop = () => () => {};

export default function ArticleShare({ url, title }: { url: string; title: string }) {
  const t = useTranslations("Articles");
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  // navigator.share only exists in the browser: false on the server and during
  // hydration (so both renders agree), the real answer after (as ContactEmail).
  const canShare = useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false);

  const handle = xHandle();
  const intent = new URL("https://x.com/intent/post");
  intent.searchParams.set("text", title);
  intent.searchParams.set("url", url);
  if (handle) intent.searchParams.set("via", handle);

  const onCopy = async () => {
    const ok = await copyText(url);
    setCopy(ok ? "copied" : "failed");
    setTimeout(() => setCopy("idle"), 1600);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={intent.toString()} target="_blank" rel="noopener noreferrer" className={PRIMARY}>
        {t("shareX")}
      </a>
      <button type="button" onClick={onCopy} className={SECONDARY} aria-live="polite">
        {copy === "copied" ? t("copied") : copy === "failed" ? t("copyFailed") : t("copyLink")}
      </button>
      {canShare && (
        <button
          type="button"
          onClick={() => navigator.share({ title, url }).catch(() => {})}
          className={SECONDARY}
        >
          {t("shareNative")}
        </button>
      )}
    </div>
  );
}
