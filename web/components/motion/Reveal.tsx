"use client";

import { motion, type Variants } from "motion/react";
import { DUR, EASE_SOFT, STAGGER } from "@/lib/motion";

// Scroll-into-view entrance: fade + a short rise, once per element. Client
// wrappers around server-rendered children, so pages stay server components.
// `data-reveal` lets the <noscript> rule in the layout force these visible
// when JS never runs (the SSR'd initial state is opacity 0).

type Tag = "div" | "section" | "ul" | "li";

const VIEWPORT = { once: true, amount: 0.15 } as const;
const HIDDEN = { opacity: 0, y: 16 };
const SHOWN = { opacity: 1, y: 0 };

export function Reveal({
  as = "div",
  delay = 0,
  className,
  children,
}: {
  as?: Tag;
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const M = motion[as];
  return (
    <M
      data-reveal
      className={className}
      initial={HIDDEN}
      whileInView={SHOWN}
      viewport={VIEWPORT}
      transition={{ duration: DUR.enter, ease: EASE_SOFT, delay }}
    >
      {children}
    </M>
  );
}

const groupVariants: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: STAGGER } },
};

const itemVariants: Variants = {
  hidden: HIDDEN,
  shown: { ...SHOWN, transition: { duration: DUR.enter, ease: EASE_SOFT } },
};

/** Parent that staggers its RevealItem children as the group scrolls in. */
export function RevealGroup({
  as = "div",
  className,
  children,
}: {
  as?: Tag;
  className?: string;
  children: React.ReactNode;
}) {
  const M = motion[as];
  return (
    <M
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={VIEWPORT}
      variants={groupVariants}
    >
      {children}
    </M>
  );
}

export function RevealItem({
  as = "div",
  className,
  children,
}: {
  as?: Tag;
  className?: string;
  children: React.ReactNode;
}) {
  const M = motion[as];
  return (
    <M data-reveal className={className} variants={itemVariants}>
      {children}
    </M>
  );
}
