"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "@/i18n/navigation";

// A header menu built on a native <details> (opens and closes without JS).
// With JS it also closes on Escape (focus back to the <summary>), an outside
// click and navigation. Shared by TeamMenu and MobileMenu.
export function useDetailsMenu() {
  const pathname = usePathname();
  // Remember the path it was opened on: navigating anywhere else closes it
  // (the header persists across client navigations) without a sync effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (v: boolean) => setOpenOn(v ? pathname : null);
  const close = () => setOpenOn(null); // a link to the page we're already on doesn't change pathname
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpenOn(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpenOn(null);
      ref.current?.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return { ref, open, setOpen, close, pathname };
}
