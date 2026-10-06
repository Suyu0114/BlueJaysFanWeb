"use client";

import { useEffect } from "react";

// Counts this article view (app/api/views/[slug]) once per browser per 24 h, so
// a reader re-opening the page doesn't count twice. Renders nothing. Automated
// browsers (navigator.webdriver) are skipped; storage can be blocked (private
// mode, previews), so every access is guarded and a failure just means one
// extra count, never a broken page.

const DAY_MS = 24 * 60 * 60 * 1000;

export default function ViewPing({ slug }: { slug: string }) {
  useEffect(() => {
    if (navigator.webdriver) return;
    const key = `article-viewed:${slug}`;
    try {
      const last = Number(localStorage.getItem(key));
      if (last && Date.now() - last < DAY_MS) return;
      localStorage.setItem(key, String(Date.now()));
    } catch {
      // storage unavailable: count anyway
    }
    fetch(`/api/views/${encodeURIComponent(slug)}`, { method: "POST", keepalive: true }).catch(() => {});
  }, [slug]);
  return null;
}
