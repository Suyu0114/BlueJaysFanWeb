import type { ReactNode } from "react";
import ScorecardFrame from "@/components/ScorecardFrame";
import { Reveal } from "@/components/motion/Reveal";

// P13: one module of the team page — the parchment `panel` frame (not
// clickable, so no hover lift), a Graduate heading and the module's plain-
// English question underneath (a sentence, so Gabriela, not Graduate).

export default function TeamPanel({
  seedKey,
  title,
  question,
  children,
}: {
  seedKey: string;
  title: string;
  question?: string;
  children: ReactNode;
}) {
  return (
    <Reveal>
      <ScorecardFrame seedKey={seedKey} variant="panel">
        <section className="relative z-10 p-4">
          <h2 className="font-display text-base uppercase tracking-wide text-navy">{title}</h2>
          {question && <p className="mt-0.5 text-sm text-navy/60">{question}</p>}
          <div className="mt-3">{children}</div>
        </section>
      </ScorecardFrame>
    </Reveal>
  );
}

/** A titled block inside a panel, with an optional action (PNG / copy) on the right. */
export function PanelBlock({
  title,
  action,
  note,
  children,
}: {
  title: string;
  action?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
}) {
  // min-w-0: as a grid / flex child it must be allowed to shrink below its
  // content, or a wide table (min-w-[32rem]) widens the whole column instead of
  // scrolling inside its own overflow-x-auto box.
  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-navy">{title}</h3>
        {action}
      </div>
      <div className="mt-2">{children}</div>
      {note && <p className="mt-2 text-[11px] leading-snug text-navy/55">{note}</p>}
    </div>
  );
}
