import type { ComponentPropsWithoutRef } from "react";
import type { MDXComponents } from "mdx/types";
import { Link } from "@/i18n/navigation";
import { ARTICLE_FIGURES } from "@/components/article/figures";

// Required by @next/mdx (App Router): how an article's Markdown renders, plus
// the figure components every article can use without importing them.
// Article headings are sentences (and often Chinese), so they stay in the body
// face — Graduate is labels-only and has neither lowercase nor CJK.

const LINK =
  "text-navy underline decoration-navy/30 underline-offset-4 transition-colors hover:text-brick hover:decoration-brick";

const components: MDXComponents = {
  h2: (props) => (
    <h2 className="mb-3 mt-12 border-l-4 border-brick pl-3 text-xl font-semibold leading-snug text-navy" {...props} />
  ),
  h3: (props) => <h3 className="mb-2 mt-8 text-lg font-semibold leading-snug text-navy" {...props} />,
  p: (props) => <p className="my-4 leading-relaxed text-navy/85" {...props} />,
  ul: (props) => <ul className="my-4 list-disc space-y-1.5 pl-6 leading-relaxed text-navy/85 marker:text-brick" {...props} />,
  ol: (props) => <ol className="my-4 list-decimal space-y-1.5 pl-6 leading-relaxed text-navy/85 marker:text-brick" {...props} />,
  strong: (props) => <strong className="font-semibold text-navy" {...props} />,
  blockquote: (props) => <blockquote className="my-6 border-l-2 border-steel pl-4 text-navy/70" {...props} />,
  hr: () => <hr className="my-10 border-navy/15" />,
  // Site paths ("/season/2026") keep the reader's locale; anything else opens in a new tab.
  a: ({ href = "", ...props }: ComponentPropsWithoutRef<"a">) =>
    href.startsWith("/") ? (
      <Link href={href} className={LINK} {...props} />
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer" className={LINK} {...props} />
    ),
  ...ARTICLE_FIGURES,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
