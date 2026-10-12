import type { ReactNode } from "react";
import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { capLogo, loadGoogleFont } from "@/lib/og";
import { SITE, siteHost } from "@/lib/site";
import { Ink, roughLine, roughRect, scorecardFrame, seedFrom } from "./rough";
import { pick, type ArticleCard, type CardSpec, type GlossaryCard, type NewsCard } from "./spec";
import { resolveCardStats, resolvePlayerExample, type CardStat, type ResolvedExample } from "./stats";
import { C, CARD_BG, CARD_BORDER, KIND, NEWS_NAVY, PARCHMENT, SHADOW, TONE, navyA, rankTintHex, type KindStyle } from "./tokens";

// The share-card renderer: the site's hand-drawn scorecard (parchment, rough.js
// double frame, offset print shadow, papaya stat cards) as a PNG for link
// previews and social posts. One skeleton for every kind — kind tag, wordmark +
// cap, an accent rule, content, footer — and one accent colour per kind
// (tokens.ts KIND). Landscape (og / x) and portrait (ig) layouts. Every number
// comes from the DB at render time (stats.ts).

export const CARD_SIZES = {
  og: { width: 1200, height: 630 }, // link previews (X / LINE / Facebook): the site's opengraph-image
  x: { width: 1200, height: 675 }, // X image post (16:9, uncropped in the timeline)
  ig: { width: 1080, height: 1440 }, // Instagram feed (3:4: fills the feed and the profile grid)
} as const;
export type CardSize = keyof typeof CARD_SIZES;

export type CardOptions = { size: CardSize; locale: string; newsStyle?: "lava" | "navy" };

// ---- layout scale ------------------------------------------------------------------

type Layout = {
  portrait: boolean;
  W: number;
  H: number;
  k: number; // stroke scale: the image is shown at ~40% in a phone feed
  m: number; // papaya margin around the card
  pad: [number, number, number]; // card padding: top, sides, bottom
  tag: number;
  wordmark: number;
  logo: number;
  label: number; // stat-card label
  value: number; // stat-card value
  sub: number; // stat-card rank / prior lines
  body: number;
  footer: number;
  gap: number;
};

function layout(size: CardSize): Layout {
  const { width: W, height: H } = CARD_SIZES[size];
  return W < H
    ? { portrait: true, W, H, k: 2, m: 36, pad: [52, 60, 44], tag: 30, wordmark: 34, logo: 96, label: 20, value: 54, sub: 22, body: 38, footer: 26, gap: 26 }
    : { portrait: false, W, H, k: 1.6, m: 26, pad: [30, 48, 24], tag: 22, wordmark: 26, logo: 66, label: 15, value: 40, sub: 16, body: 27, footer: 20, gap: 16 };
}

// ---- text fitting --------------------------------------------------------------------

const CJK = /[　-〿㐀-鿿＀-￯]/;
const hasCjk = (s: string) => CJK.test(s);

// Rough advance widths: CJK = 1em, Latin ≈ 0.55em (Gabriela is wide), space ≈ 0.28em.
function textWidth(s: string, size: number): number {
  let w = 0;
  for (const ch of s) w += CJK.test(ch) ? size : ch === " " ? size * 0.28 : size * 0.55;
  return w;
}

/** The largest size from `sizes` whose text fits `width` in `lines` lines (10% slack for word wrap). */
function fit(text: string, width: number, lines: number, sizes: number[]): number {
  for (const s of sizes) if (Math.ceil((textWidth(text, s) * 1.1) / width) <= lines) return s;
  return sizes[sizes.length - 1];
}

// ---- building blocks -----------------------------------------------------------------

const prose = (zh: boolean) => (zh ? "Noto Serif TC" : "Gabriela");

function Tag({ text, kind, zh, L, seed }: { text: string; kind: KindStyle; zh: boolean; L: Layout; seed: number }) {
  const fs = L.tag;
  const tw = zh ? text.length * fs + (text.length - 1) * 4 : text.length * (fs * 0.78 + 2);
  const w = Math.round(tw + fs * 1.5);
  const h = Math.round(fs * 2.1);
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: w, height: h }}>
      <Ink
        width={w}
        height={h}
        paths={roughRect(3, 3, w - 6, h - 6, { stroke: kind.accent, strokeWidth: 1.6 * L.k, roughness: 1.5, seed, fill: kind.tagFill })}
      />
      <div
        style={{
          fontFamily: zh ? "Noto Serif TC" : "Graduate",
          fontWeight: zh ? 700 : 400,
          fontSize: fs,
          letterSpacing: zh ? 4 : 2,
          color: kind.tagInk,
          textTransform: "uppercase",
        }}
      >
        {text}
      </div>
    </div>
  );
}

function Rule({ color, width, L, seed }: { color: string; width: number; L: Layout; seed: number }) {
  const h = Math.round(10 * L.k);
  return (
    <div style={{ position: "relative", display: "flex", width, height: h }}>
      <Ink width={width} height={h} paths={roughLine(4, h / 2, width - 4, h / 2, { stroke: color, strokeWidth: 3.2 * L.k, roughness: 1.6, bowing: 1.5, seed })} />
    </div>
  );
}

function Chip({ text, bg, ink, size, k }: { text: string; bg: string; ink: string; size: number; k: number }) {
  return (
    <div style={{ display: "flex", background: bg, color: ink, borderRadius: 999, padding: `${2 * k}px ${8 * k}px`, fontFamily: "Gabriela", fontSize: size }}>
      {text}
    </div>
  );
}

/** The season page's stat card: label, value + Δ chip, MLB rank chip, prior season. */
function StatCard({ stat, rankLabel, zh, L, grow }: { stat: CardStat; rankLabel: string; zh: boolean; L: Layout; grow: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        ...(grow ? { flex: 1 } : {}),
        background: CARD_BG,
        border: `${1.5 * L.k}px solid ${CARD_BORDER}`,
        borderRadius: 8 * L.k,
        padding: `${(L.portrait ? 8 : 10) * L.k}px ${14 * L.k}px`,
      }}
    >
      <div
        style={{
          fontFamily: hasCjk(stat.label) ? "Noto Serif TC" : "Graduate",
          fontSize: L.label,
          letterSpacing: 1.5,
          color: navyA(0.55),
          textTransform: "uppercase",
        }}
      >
        {stat.label}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 * L.k, marginTop: 2 * L.k }}>
        <div style={{ fontFamily: "Gabriela", fontSize: L.value, color: C.navy, lineHeight: 1.1 }}>{stat.value}</div>
        {stat.delta && <Chip text={stat.delta.text} bg={TONE[stat.delta.tone].bg} ink={TONE[stat.delta.tone].ink} size={L.sub} k={L.k} />}
      </div>
      {stat.rank && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 * L.k, marginTop: 4 * L.k, fontFamily: prose(zh), fontSize: L.sub, color: navyA(0.55) }}>
          <div>{rankLabel}</div>
          <div style={{ display: "flex", background: rankTintHex(stat.rank.rank), color: C.navy, borderRadius: 4 * L.k, padding: `${1 * L.k}px ${6 * L.k}px` }}>
            {stat.rank.text}
          </div>
        </div>
      )}
      {stat.prior && <div style={{ marginTop: 3 * L.k, fontFamily: prose(zh), fontSize: L.sub, color: navyA(0.5) }}>{stat.prior}</div>}
    </div>
  );
}

/** A small papaya card: value over label (Baseball 101 scale, News facts). */
function NoteCard({ value, label, zh, L, flex = true }: { value: string; label: string; zh: boolean; L: Layout; flex?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        ...(flex ? { flex: 1 } : {}),
        background: CARD_BG,
        border: `${1.5 * L.k}px solid ${CARD_BORDER}`,
        borderRadius: 8 * L.k,
        padding: `${8 * L.k}px ${14 * L.k}px`,
      }}
    >
      <div style={{ fontFamily: "Gabriela", fontSize: L.value * 0.8, color: C.navy, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontFamily: prose(zh), fontSize: L.sub, color: navyA(0.6), marginTop: 2 * L.k }}>{label}</div>
    </div>
  );
}

/** A rubber stamp: double rough box, tilted, in the kind's accent. */
function Stamp({ big, small, color, zh, L, seed }: { big: string; small: string; color: string; zh: boolean; L: Layout; seed: number }) {
  const fs = L.portrait ? 54 : 40;
  const w = Math.round(Math.max(textWidth(big, fs) * (zh ? 1 : 1.25), fs * 3.4) + fs * 1.2);
  const h = Math.round(fs * 2.7);
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: w,
        height: h,
        transform: "rotate(-7deg)",
      }}
    >
      <Ink
        width={w}
        height={h}
        paths={[
          ...roughRect(4, 4, w - 8, h - 8, { stroke: color, strokeWidth: 3 * L.k, roughness: 2.2, seed }),
          ...roughRect(4 + 6 * L.k, 4 + 6 * L.k, w - 8 - 12 * L.k, h - 8 - 12 * L.k, { stroke: color, strokeWidth: 1.2 * L.k, roughness: 2.6, seed: seed + 7 }),
        ]}
      />
      <div style={{ fontFamily: zh ? "Noto Serif TC" : "Graduate", fontWeight: zh ? 700 : 400, fontSize: fs, color, letterSpacing: zh ? 2 : 3, lineHeight: 1 }}>
        {big}
      </div>
      <div style={{ fontFamily: "Graduate", fontSize: fs * 0.5, color, letterSpacing: 4, marginTop: 4 * L.k }}>{small}</div>
    </div>
  );
}

// ---- the card shell ------------------------------------------------------------------

type Shell = {
  L: Layout;
  seed: number;
  kind: KindStyle;
  tag: string;
  zh: boolean;
  logo: string;
  headerExtra?: ReactNode;
  footerLeft: string;
  children: ReactNode;
};

function Card({ L, seed, kind, tag, zh, logo, headerExtra, footerLeft, children }: Shell) {
  const off = Math.round(6 * L.k);
  const cw = L.W - 2 * L.m - off;
  const ch = L.H - 2 * L.m - off;
  return (
    <div style={{ display: "flex", width: L.W, height: L.H, background: C.papaya, padding: L.m }}>
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          width: cw,
          height: ch,
          background: PARCHMENT,
          borderRadius: 12 * L.k,
          boxShadow: `${off}px ${off}px 0 0 ${SHADOW}`,
          padding: `${L.pad[0]}px ${L.pad[1]}px ${L.pad[2]}px`,
        }}
      >
        <Ink width={cw} height={ch} paths={scorecardFrame(cw, ch, seed, L.k)} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 * L.k }}>
            <Tag text={tag} kind={kind} zh={zh} L={L} seed={seed + 11} />
            {headerExtra}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 * L.k }}>
            <div style={{ fontFamily: "Graduate", fontSize: L.wordmark, letterSpacing: 2, color: C.navy }}>
              {SITE.name.toUpperCase()}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img> */}
            <img src={logo} width={L.logo} height={L.logo} alt="" />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>{children}</div>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", columnGap: 24 * L.k, fontSize: L.footer }}>
          <div style={{ fontFamily: prose(zh), color: navyA(0.7) }}>{footerLeft}</div>
          <div style={{ fontFamily: "Gabriela", color: navyA(0.55), marginLeft: "auto" }}>{siteHost()}</div>
        </div>
      </div>
    </div>
  );
}

// ---- kinds -----------------------------------------------------------------------------

const dateFmt = (locale: string, ymd: string, opts: Intl.DateTimeFormatOptions = { dateStyle: "long" }) =>
  new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(new Date(`${ymd}T00:00:00Z`));

type Ctx = { L: Layout; zh: boolean; locale: string; logo: string; seed: number; byline: string; rankLabel: string };

function ArticleBody({ spec, stats, c }: { spec: ArticleCard; stats: CardStat[]; c: Ctx }) {
  const { L, zh } = c;
  const title = pick(spec.title, c.locale);
  const inner = L.W - 2 * L.m - 2 * L.pad[1];
  const size = L.portrait ? fit(title, inner, 4, [80, 72, 64, 56]) : fit(title, inner, 2, [56, 50, 44, 40]);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", fontFamily: prose(zh), fontWeight: zh ? 700 : 400, fontSize: size, lineHeight: 1.2, color: C.navy, marginTop: L.gap * (L.portrait ? 1.6 : 1) }}>
        {title}
      </div>
      <div style={{ display: "flex", marginTop: L.gap * 0.8 }}>
        <Rule color={KIND.article.accent} width={L.portrait ? 260 : 190} L={L} seed={c.seed + 21} />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: L.portrait ? "column" : "row",
          gap: L.gap,
          marginTop: L.gap * (L.portrait ? 1.4 : 1.1),
        }}
      >
        {stats.map((s) => (
          <StatCard key={s.label} stat={s} rankLabel={c.rankLabel} zh={zh} L={L} grow={!L.portrait} />
        ))}
      </div>
    </div>
  );
}

function GlossaryBody({ spec, example, c, exampleTitle }: { spec: GlossaryCard; example: ResolvedExample | null; c: Ctx; exampleTitle: string }) {
  const number = `NO. ${String(spec.number).padStart(3, "0")}`;
  const { L, zh } = c;
  const definition = pick(spec.definition, c.locale);
  const inner = L.W - 2 * L.m - 2 * L.pad[1];
  const termSize = L.portrait ? fit(spec.term, inner, 1, [190, 160, 130]) : fit(spec.term, inner * 0.58, 1, [118, 100, 84]);
  const defWidth = L.portrait ? inner : inner * 0.58;
  const defSize = L.portrait ? fit(definition, defWidth, 7, [40, 36, 32]) : fit(definition, defWidth, 5, [27, 25, 23, 21]);
  const scale = spec.scale ?? [];

  const exampleCard = example && (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: CARD_BG,
        border: `${1.5 * L.k}px solid ${CARD_BORDER}`,
        borderRadius: 8 * L.k,
        padding: `${10 * L.k}px ${14 * L.k}px`,
      }}
    >
      <div style={{ fontFamily: zh ? "Noto Serif TC" : "Graduate", fontSize: L.label, letterSpacing: 1.5, color: navyA(0.55), textTransform: "uppercase" }}>
        {exampleTitle}
      </div>
      <div style={{ fontFamily: "Gabriela", fontSize: L.sub * 1.25, color: C.navy, marginTop: 2 * L.k }}>{example.name}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 * L.k, marginTop: 2 * L.k, fontFamily: "Gabriela", color: C.navy }}>
        {example.points.map((p, i) => (
          <div key={p.season} style={{ display: "flex", alignItems: "baseline", gap: 6 * L.k }}>
            {i > 0 && <div style={{ fontSize: L.value * 0.6, color: navyA(0.45) }}>→</div>}
            <div style={{ fontSize: L.sub, color: navyA(0.55) }}>{String(p.season)}</div>
            <div style={{ fontSize: L.value * 0.75 }}>{p.value}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const left = (
    <div style={{ display: "flex", flexDirection: "column", ...(L.portrait ? {} : { width: inner * 0.6 }) }}>
      {L.portrait && (
        <div style={{ fontFamily: "Graduate", fontSize: L.tag * 0.9, letterSpacing: 2, color: navyA(0.55), marginBottom: 8 * L.k }}>{number}</div>
      )}
      <div style={{ fontFamily: "Gabriela", fontSize: termSize, lineHeight: 1, color: C.navy }}>{spec.term}</div>
      {spec.aka && <div style={{ fontFamily: "Gabriela", fontSize: L.sub * 1.3, color: navyA(0.6), marginTop: 6 * L.k }}>{spec.aka}</div>}
      <div style={{ display: "flex", marginTop: L.gap * 0.9 }}>
        <Rule color={KIND.glossary.accent} width={L.portrait ? 260 : 170} L={L} seed={c.seed + 21} />
      </div>
      <div style={{ display: "flex", fontFamily: prose(zh), fontSize: defSize, lineHeight: 1.45, color: C.navy, marginTop: L.gap * 0.9 }}>
        {definition}
      </div>
    </div>
  );

  if (L.portrait) {
    return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", marginTop: L.gap * 1.6 }}>{left}</div>
        {scale.length > 0 && (
          <div style={{ display: "flex", gap: L.gap * 0.7, marginTop: L.gap * 1.4 }}>
            {scale.map((s) => (
              <NoteCard key={s.value} value={s.value} label={pick(s.label, c.locale)} zh={zh} L={L} />
            ))}
          </div>
        )}
        {exampleCard && <div style={{ display: "flex", flexDirection: "column", marginTop: L.gap * 0.8 }}>{exampleCard}</div>}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: L.gap * 2, marginTop: L.gap * 1.1 }}>
      {left}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: L.gap * 0.6 }}>
        {scale.map((s) => (
          <div
            key={s.value}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 12 * L.k,
              background: CARD_BG,
              border: `${1.5 * L.k}px solid ${CARD_BORDER}`,
              borderRadius: 8 * L.k,
              padding: `${5 * L.k}px ${12 * L.k}px`,
            }}
          >
            <div style={{ fontFamily: "Gabriela", fontSize: L.value * 0.72, color: C.navy, width: L.value * 1.7 }}>{s.value}</div>
            <div style={{ fontFamily: prose(zh), fontSize: L.sub * 1.1, color: navyA(0.65) }}>{pick(s.label, c.locale)}</div>
          </div>
        ))}
        {exampleCard}
      </div>
    </div>
  );
}

function NewsBody({ spec, kind, c }: { spec: NewsCard; kind: KindStyle; c: Ctx }) {
  const { L, zh } = c;
  const headline = pick(spec.headline, c.locale);
  const deck = spec.deck ? pick(spec.deck, c.locale) : null;
  const inner = L.W - 2 * L.m - 2 * L.pad[1];
  const textW = L.portrait ? inner : inner - 300;
  const hSize = L.portrait ? fit(headline, textW, 4, [96, 88, 80, 72, 64, 56]) : fit(headline, textW, 3, [52, 46, 42, 38]);
  const dSize = L.portrait ? fit(deck ?? "", textW, 5, [36, 32, 28]) : fit(deck ?? "", textW, 3, [25, 23, 21]);
  const stamp = zh
    ? { big: dateFmt("zh-TW", spec.date, { month: "numeric", day: "numeric" }), small: spec.date.slice(0, 4) }
    : { big: dateFmt("en", spec.date, { month: "short", day: "numeric" }).toUpperCase(), small: spec.date.slice(0, 4) };
  const facts = (spec.facts ?? []).slice(0, 3);

  const text = (
    <div style={{ display: "flex", flexDirection: "column", ...(L.portrait ? {} : { width: textW }) }}>
      <div style={{ display: "flex", fontFamily: prose(zh), fontWeight: zh ? 700 : 400, fontSize: hSize, lineHeight: 1.2, color: C.navy }}>{headline}</div>
      <div style={{ display: "flex", marginTop: L.gap * 0.8 }}>
        <Rule color={kind === NEWS_NAVY ? C.brick : kind.accent} width={L.portrait ? 260 : 170} L={L} seed={c.seed + 21} />
      </div>
      {deck && (
        <div style={{ display: "flex", fontFamily: prose(zh), fontSize: dSize, lineHeight: 1.45, color: navyA(0.85), marginTop: L.gap * 0.8 }}>{deck}</div>
      )}
    </div>
  );
  const factRow = facts.length > 0 && (
    <div style={{ display: "flex", flexDirection: "row", gap: L.gap, marginTop: L.gap * (L.portrait ? 1.6 : 1.1) }}>
      {facts.map((f) => (
        <NoteCard key={f.value + pick(f.label, "en")} value={f.value} label={pick(f.label, c.locale)} zh={zh} L={L} />
      ))}
    </div>
  );
  const stampEl = <Stamp big={stamp.big} small={stamp.small} color={kind === NEWS_NAVY ? C.navy : kind.accent} zh={zh} L={L} seed={c.seed + 31} />;

  if (L.portrait) {
    return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: L.gap }}>{stampEl}</div>
        <div style={{ display: "flex", marginTop: L.gap }}>{text}</div>
        {factRow}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: L.gap * 1.1 }}>
        {text}
        <div style={{ display: "flex", marginTop: 6 * L.k, marginRight: 8 * L.k }}>{stampEl}</div>
      </div>
      {factRow}
    </div>
  );
}

// ---- entry point -----------------------------------------------------------------------

/** Every string on the card, for subsetting the fonts. */
function allText(spec: CardSpec, extra: string[]): string {
  return [JSON.stringify(spec), SITE.name, SITE.name.toUpperCase(), siteHost(), "→0123456789−+.%", ...extra].join("");
}

export async function renderShareCard(spec: CardSpec, opts: CardOptions): Promise<ImageResponse> {
  const L = layout(opts.size);
  const locale = opts.locale === "zh-TW" ? "zh-TW" : "en";
  const zh = locale === "zh-TW";
  const kind = spec.kind === "news" && opts.newsStyle === "navy" ? NEWS_NAVY : KIND[spec.kind];
  const seed = seedFrom(`${spec.kind}:${spec.slug}`);

  const [tA, tS, tC, logo] = await Promise.all([
    getTranslations({ locale, namespace: "Articles" }),
    getTranslations({ locale, namespace: "Season" }),
    getTranslations({ locale, namespace: "ShareCard" }),
    capLogo(),
  ]);
  const [stats, example] = await Promise.all([
    spec.kind === "article" ? resolveCardStats(spec.season, spec.stats, locale) : Promise.resolve([] as CardStat[]),
    spec.kind === "glossary" && spec.example ? resolvePlayerExample(spec.example) : Promise.resolve(null),
  ]);

  const byline = tA("byline", { author: SITE.author });
  const date = dateFmt(locale, spec.date, { dateStyle: "medium" });
  const tag = kind.tag[locale];
  const numberText = spec.kind === "glossary" ? tC("number", { n: String(spec.number).padStart(3, "0") }) : "";
  const footerLeft =
    spec.kind === "news"
      ? `${tC("source", { source: spec.source })} · ${date}`
      : `${byline} · ${date}`;
  const strings = [
    byline,
    date,
    tag,
    kind.tag.en.toUpperCase(),
    numberText,
    footerLeft,
    tS("rankLabel"),
    tC("example"),
    ...stats.flatMap((s) => [s.label, s.label.toUpperCase(), s.value, s.delta?.text ?? "", s.rank?.text ?? "", s.prior ?? ""]),
    example ? `${example.name}${example.label}${example.points.map((p) => `${p.season}${p.value}`).join("")}` : "",
  ];
  const text = allText(spec, strings);

  const [graduate, gabriela, notoBold, noto] = await Promise.all([
    loadGoogleFont("Graduate", 400, text.toUpperCase() + text),
    loadGoogleFont("Gabriela", 400, text),
    zh ? loadGoogleFont("Noto Serif TC", 700, text) : Promise.resolve(null),
    zh ? loadGoogleFont("Noto Serif TC", 400, text) : Promise.resolve(null),
  ]);
  // No Chinese face, no Chinese card: the English one beats boxes for glyphs.
  if (zh && (!notoBold || !noto)) return renderShareCard(spec, { ...opts, locale: "en" });

  const c: Ctx = { L, zh, locale, logo, seed, byline, rankLabel: tS("rankLabel") };
  const body =
    spec.kind === "article" ? (
      <ArticleBody spec={spec} stats={stats} c={c} />
    ) : spec.kind === "glossary" ? (
      <GlossaryBody spec={spec} example={example} c={c} exampleTitle={tC("example")} />
    ) : (
      <NewsBody spec={spec} kind={kind} c={c} />
    );

  const headerExtra =
    spec.kind === "glossary" && !L.portrait ? (
      <div style={{ display: "flex", fontFamily: "Graduate", fontSize: L.tag * 0.9, letterSpacing: 2, color: navyA(0.55) }}>
        {`NO. ${String(spec.number).padStart(3, "0")}`}
      </div>
    ) : undefined;

  const fonts = [
    { name: "Graduate", data: graduate, weight: 400 as const },
    { name: "Gabriela", data: gabriela, weight: 400 as const },
    { name: "Noto Serif TC", data: noto, weight: 400 as const },
    { name: "Noto Serif TC", data: notoBold, weight: 700 as const },
  ].flatMap((f) => (f.data ? [{ ...f, data: f.data, style: "normal" as const }] : []));

  return new ImageResponse(
    (
      <Card L={L} seed={seed} kind={kind} tag={tag} zh={zh} logo={logo} headerExtra={headerExtra} footerLeft={footerLeft}>
        {body}
      </Card>
    ),
    { width: L.W, height: L.H, fonts },
  );
}
