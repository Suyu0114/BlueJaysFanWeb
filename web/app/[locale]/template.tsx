"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import { EASE_SOFT } from "@/lib/motion";

// Unlike layout.tsx, a template remounts when the top-level section changes
// (home / players / standings / about), so this is where the page-to-page fade
// lives. The very first load skips it: the SSR'd page stays visible instead of
// waiting on hydration, and the per-section Reveals give first paint its
// entrance. `hydrated` is only ever flipped in an effect — never during render
// — so the server (no effects) and the hydration render both see `false`.
let hydrated = false;

export default function Template({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    hydrated = true;
  }, []);

  return (
    <motion.div
      initial={hydrated ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: EASE_SOFT }}
    >
      {children}
    </motion.div>
  );
}
