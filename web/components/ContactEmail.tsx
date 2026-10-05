"use client";

// The contact email, kept out of the server HTML as a plain "user@domain"
// string (what scrapers look for). Server render / no JS: readable text,
// "suyu0229 (at) gmail (dot) com". After hydration: a real mailto: link.

import { useSyncExternalStore } from "react";
import { SITE } from "@/lib/site";

const noop = () => () => {};

export default function ContactEmail({ className = "" }: { className?: string }) {
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const { user, domain } = SITE.email;
  if (!hydrated) {
    return <span className={className}>{`${user} (at) ${domain.replace(".", " (dot) ")}`}</span>;
  }
  const address = `${user}@${domain}`;
  return (
    <a href={`mailto:${address}`} className={className}>
      {address}
    </a>
  );
}
