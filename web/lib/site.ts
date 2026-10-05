// The site's name, author and contact links: the one place they live. The
// header, footer, About page, layout metadata and every PNG / copied table read
// from here, so a rename or a new profile link is a one-line change. No DB, no
// i18n: the brand is a proper noun and stays English in zh-TW (like player names).

export const SITE = {
  name: "Suyu's Jays Notes",
  author: "Suyu Cheng",
  url: "https://bluejaysfanweb.vercel.app",
  links: {
    linkedin: "https://www.linkedin.com/in/suyu-cheng",
    portfolio: "https://suyu-portfolio.vercel.app",
    // e.g. "https://x.com/<handle>" once the account exists; null hides it everywhere.
    x: null as string | null,
  },
  // Assembled on the client (ContactEmail) so the address never appears as
  // plain "user@domain" text in the server HTML that scrapers read.
  email: { user: "suyu0229", domain: "gmail.com" },
} as const;

export const DATA_SOURCES = "Baseball Savant / MLB Stats API";

export function siteHost(): string {
  return new URL(SITE.url).host;
}

/** Credit line on every exported PNG and copied table. */
export function sourceLine(date = new Date().toISOString().slice(0, 10)): string {
  return `${SITE.name} · ${siteHost()} · Data: ${DATA_SOURCES} · ${date}`;
}
