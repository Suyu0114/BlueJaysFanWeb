// Header nav order, shared by the desktop links (Header) and the phone menu
// (MobileMenu) so the two can't drift. "team" is the Team ▾ menu, not a link.
export const NAV_ITEMS = [
  { key: "home", href: "/" },
  { key: "players", href: "/players" },
  { key: "standings", href: "/standings" },
  { key: "team", href: null },
  { key: "articles", href: "/articles" },
  { key: "about", href: "/about" },
] as const;
