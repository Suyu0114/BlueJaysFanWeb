import type { ReactNode } from "react";
import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { SITE, siteHost } from "@/lib/site";
import { capLogo, cardFonts } from "./fonts";
import { Ink, roughLine, roughRect, scorecardFrame, seedFrom } from "./rough";
import { pick, type ArticleCard, type CardSpec, type GlossaryCard, type NewsCard, type PartCard } from "./spec";
import {
  resolveCardStats,
  resolvePlayerExample,
  resolvePlayersExample,
  resolveRecordExample,
  resolveTeamExample,
  type CardStat,
  type ExampleTable,
  type GlossaryExample,
  type ResolvedExample,
} from "./stats";
import { C, KIND, PAPERS, SHADOW, TONE, navyA, rankTintHex, softInk, type KindStyle } from "./tokens";

// The share-card renderer: the site's hand-drawn scorecard (parchment, rough.js
// double frame, offset print shadow, papaya stat cards) as a PNG for link
// previews and social posts. One skeleton for every kind — kind tag, wordmark +
// cap, a hand-drawn rule, content, footer — and one paper per kind (tokens.ts
// KIND). Landscape (og / x) and portrait (ig) layouts. Every number comes
// from the DB at render time (stats.ts). renderSiteCard is the site's default
// link preview on the same paper and frame.

export const CARD_SIZES = {
  og: { width: 1200, height: 630 }, // link previews (X / LINE / Facebook): the site's opengraph-image
  x: { width: 1200, height: 675 }, // X image post (16:9, uncropped in the timeline)
  ig: { width: 1080, height: 1440 }, // Instagram feed (3:4: fills the feed and the profile grid)
} as const;
export type CardSize = keyof typeof CARD_SIZES;

export type CardOptions = { size: CardSize; locale: string };

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

// Multi-line prose (Lines): "\n" starts a line, "1. " a numbered step indented STEP_INDENT em, LINE_GAP em between lines.
const STEP = /^(\d+)\.\s+(.*)$/;
const STEP_INDENT = 1.3;
const LINE_GAP = 0.3;

/** The largest size from `sizes` whose text fits `width` in `lines` lines (10% slack for word wrap), counting Lines' breaks, step indents and gaps. */
function fit(text: string, width: number, lines: number, sizes: number[]): number {
  const parts = text.split("\n");
  const count = (s: number) =>
    parts.reduce((n, p) => {
      const step = STEP.exec(p);
      return n + Math.ceil((textWidth(step ? step[2] : p, s) * 1.1) / (step ? width - s * STEP_INDENT : width));
    }, 0) +
    ((parts.length - 1) * LINE_GAP) / 1.45;
  for (const s of sizes) if (count(s) <= lines) return s;
  return sizes[sizes.length - 1];
}

// ---- building blocks -----------------------------------------------------------------

const prose = (zh: boolean) => (zh ? "Noto Serif TC" : "Gabriela");
/** English prose: a hyphen between two letters or digits never ends a line ("Hard-hit%", "79-83"). Gabriela has U+2011; zh text keeps plain hyphens. */
const nbHyphens = (s: string, zh: boolean) => (zh ? s : s.replace(/(?<=[A-Za-z0-9])-(?=[A-Za-z0-9])/g, "\u2011"));

// CJK titles break after punctuation, so a phrase never splits across lines ("最多一張大合約"
// was cut before 合約). Satori ignores word-break: keep-all, so the title is cut into pieces after
// each punctuation mark and each piece is a nowrap flex item in a wrapping row. Spaces are not
// break points: in a zh title they are only the gap around Latin and digits ("能打 20 轟"), and
// breaking there strands a number from its unit. A piece too wide for the line wraps anywhere, as
// before. Titles only: body text may have no break point.
const BREAK_AFTER = /[，、：；。！？）」』]/;
function cjkPieces(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (const ch of s) {
    cur += ch;
    if (BREAK_AFTER.test(ch)) {
      out.push(cur);
      cur = "";
    }
  }
  if (cur.trim()) out.push(cur);
  return out.map((p) => p.trim()).filter(Boolean);
}
/** The title row's wrapping style: zh wraps its pieces (see cjkPieces). */
const titleRow = (zh: boolean) => (zh ? { flexWrap: "wrap" as const } : {});
/** A title's content: English as one string, zh as pieces that only break between them. */
function titleContent(title: string, zh: boolean, size: number, width: number) {
  if (!zh) return nbHyphens(title, false);
  return cjkPieces(title).map((p, i) => (
    <span key={i} style={{ whiteSpace: textWidth(p, size) <= width ? "nowrap" : "normal" }}>
      {p}
    </span>
  ));
}

function Tag({ text, S, zh, L, seed }: { text: string; S: KindStyle; zh: boolean; L: Layout; seed: number }) {
  const fs = L.tag;
  const tw = zh ? text.length * fs + (text.length - 1) * 4 : text.length * (fs * 0.78 + 2);
  const w = Math.round(tw + fs * 1.5);
  const h = Math.round(fs * 2.1);
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: w, height: h }}>
      <Ink
        width={w}
        height={h}
        paths={roughRect(3, 3, w - 6, h - 6, { stroke: S.accent, strokeWidth: 1.6 * L.k, roughness: 1.5, seed, fill: S.tagFill })}
      />
      <div
        style={{
          fontFamily: zh ? "Noto Serif TC" : "Graduate",
          fontWeight: zh ? 700 : 400,
          fontSize: fs,
          letterSpacing: zh ? 4 : 2,
          color: S.tagInk,
          textTransform: "uppercase",
        }}
      >
        {text}
      </div>
    </div>
  );
}

/** Prose split at "\n"; a line starting "1. " is a numbered step with a hanging indent. Font, size and colour come from the parent. */
function Lines({ text, zh, size, width }: { text: string; zh: boolean; size: number; width: number }) {
  const marker = size * STEP_INDENT;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: size * LINE_GAP }}>
      {text.split("\n").map((line, i) => {
        const step = STEP.exec(line);
        return step ? (
          // Explicit widths: in the portrait column `flex: 1` collapses to min-content.
          <div key={i} style={{ display: "flex" }}>
            <div style={{ display: "flex", width: marker, flexShrink: 0 }}>{`${step[1]}.`}</div>
            <div style={{ display: "flex", width: width - marker }}>{nbHyphens(step[2], zh)}</div>
          </div>
        ) : (
          <div key={i} style={{ display: "flex" }}>
            {nbHyphens(line, zh)}
          </div>
        );
      })}
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

/**
 * The season page's stat card: label, value + Δ chip, MLB rank chip, prior
 * season. Portrait cards are full-width rows, so rank + prior sit on the right
 * instead of under the value (three stacked cards otherwise crowd the footer).
 */
function StatCard({ stat, rankLabel, S, zh, L, grow }: { stat: CardStat; rankLabel: string; S: KindStyle; zh: boolean; L: Layout; grow: boolean }) {
  const main = (
    <div style={{ display: "flex", flexDirection: "column" }}>
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
    </div>
  );
  const side = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: L.portrait ? "flex-end" : "flex-start", gap: 4 * L.k, marginTop: L.portrait ? 0 : 4 * L.k }}>
      {stat.rank && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 * L.k, fontFamily: prose(zh), fontSize: L.sub, color: navyA(0.55) }}>
          <div>{rankLabel}</div>
          <div style={{ display: "flex", background: rankTintHex(stat.rank.rank), color: C.navy, borderRadius: 4 * L.k, padding: `${1 * L.k}px ${6 * L.k}px` }}>
            {stat.rank.text}
          </div>
        </div>
      )}
      {stat.prior && <div style={{ fontFamily: prose(zh), fontSize: L.sub, color: navyA(0.5) }}>{stat.prior}</div>}
    </div>
  );
  return (
    <div
      style={{
        display: "flex",
        flexDirection: L.portrait ? "row" : "column",
        ...(L.portrait ? { alignItems: "flex-end", justifyContent: "space-between" } : {}),
        ...(grow ? { flex: 1 } : {}),
        background: S.card,
        border: `${1.5 * L.k}px solid ${S.cardBorder}`,
        borderRadius: 8 * L.k,
        padding: `${10 * L.k}px ${14 * L.k}px`,
      }}
    >
      {main}
      {side}
    </div>
  );
}

/**
 * A tile label's explicit "\n" breaks, one div per line: Satori breaks CJK anywhere, so a tile label that wraps
 * picks its own break. Without one, the plain string. The landscape scale rows are wide: there "\n" is a space.
 */
const labelLines = (s: string): ReactNode => (s.includes("\n") ? s.split("\n").map((t, i) => <div key={i}>{t}</div>) : s);
const labelColumn = (s: string) => (s.includes("\n") ? { display: "flex", flexDirection: "column" as const } : {});

/** A small papaya card: value over label (Baseball 101 scale, News facts). */
function NoteCard({ value, label, S, zh, L, flex = true, row = false }: { value: string; label: string; S: KindStyle; zh: boolean; L: Layout; flex?: boolean; row?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: row ? "row" : "column",
        ...(row ? { alignItems: "center", justifyContent: "space-between", gap: 16 * L.k } : {}),
        ...(flex ? { flex: 1 } : {}),
        background: S.card,
        border: `${1.5 * L.k}px solid ${S.cardBorder}`,
        borderRadius: 8 * L.k,
        padding: `${8 * L.k}px ${14 * L.k}px`,
      }}
    >
      <div style={{ fontFamily: "Gabriela", fontSize: L.value * 0.8, color: C.navy, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontFamily: prose(zh), fontSize: row ? L.sub * 1.2 : L.sub, color: navyA(0.6), ...(row ? { textAlign: "right" } : { marginTop: 2 * L.k }), ...labelColumn(label) }}>{labelLines(label)}</div>
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
  S: KindStyle;
  tag: string;
  zh: boolean;
  logo: string;
  headerExtra?: ReactNode;
  footerLeft: string;
  children: ReactNode;
};

/** The paper on the papaya page: offset print shadow + the hand-drawn double frame. Children stack in a column. */
function Sheet({ L, S, seed, children }: { L: Layout; S: Pick<KindStyle, "paper" | "ink">; seed: number; children: ReactNode }) {
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
          background: S.paper,
          borderRadius: 12 * L.k,
          boxShadow: `${off}px ${off}px 0 0 ${SHADOW}`,
          padding: `${L.pad[0]}px ${L.pad[1]}px ${L.pad[2]}px`,
        }}
      >
        <Ink width={cw} height={ch} paths={scorecardFrame(cw, ch, seed, L.k, S.ink)} />
        {children}
      </div>
    </div>
  );
}

function Card({ L, seed, S, tag, zh, logo, headerExtra, footerLeft, children }: Shell) {
  return (
    <Sheet L={L} S={S} seed={seed}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 * L.k }}>
            <Tag text={tag} S={S} zh={zh} L={L} seed={seed + 11} />
            {headerExtra}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 * L.k }}>
            <div style={{ fontFamily: "Graduate", fontSize: L.wordmark, letterSpacing: 2, color: S.ink }}>
              {SITE.name.toUpperCase()}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img> */}
            <img src={logo} width={L.logo} height={L.logo} alt="" />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>{children}</div>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", columnGap: 24 * L.k, fontSize: L.footer }}>
          <div style={{ fontFamily: prose(zh), color: softInk(S, 0.7) }}>{footerLeft}</div>
          <div style={{ fontFamily: "Gabriela", color: softInk(S, 0.55), marginLeft: "auto" }}>{siteHost()}</div>
        </div>
    </Sheet>
  );
}

// ---- kinds -----------------------------------------------------------------------------

const dateFmt = (locale: string, ymd: string, opts: Intl.DateTimeFormatOptions = { dateStyle: "long" }) =>
  new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(new Date(`${ymd}T00:00:00Z`));

type Ctx = { L: Layout; S: KindStyle; zh: boolean; locale: string; logo: string; seed: number; byline: string; rankLabel: string };

function ArticleBody({ spec, stats, c }: { spec: ArticleCard; stats: CardStat[]; c: Ctx }) {
  const { L, S, zh } = c;
  const title = pick(spec.title, c.locale);
  const inner = L.W - 2 * L.m - 2 * L.pad[1];
  const size = L.portrait ? fit(title, inner, 4, [80, 72, 64, 56]) : fit(title, inner, 2, [56, 50, 44, 40]);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", fontFamily: prose(zh), fontWeight: zh ? 700 : 400, fontSize: size, lineHeight: 1.2, color: S.ink, marginTop: L.gap * (L.portrait ? 1.6 : 1), ...titleRow(zh) }}>
        {titleContent(title, zh, size, inner)}
      </div>
      <div style={{ display: "flex", marginTop: L.gap * 0.8 }}>
        <Rule color={S.rule} width={L.portrait ? 260 : 190} L={L} seed={c.seed + 21} />
      </div>
      {stats.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: L.portrait ? "column" : "row",
            gap: L.gap,
            marginTop: L.gap * (L.portrait ? 1.4 : 1.1),
          }}
        >
          {stats.map((s) => (
            <StatCard key={s.label} stat={s} rankLabel={c.rankLabel} S={S} zh={zh} L={L} grow={!L.portrait} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A Baseball 101 example, one value per season: the player's name, or the team + metric, then season → value (with the MLB rank chip for the team). */
function ExampleSeries({ series, teamName, c }: { series: ResolvedExample; teamName: string; c: Ctx }) {
  const { L, zh } = c;
  const ranked = series.points.some((p) => p.rank);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ fontFamily: series.name ? "Gabriela" : prose(zh), fontSize: L.sub * 1.25, color: C.navy, marginTop: 2 * L.k }}>
        {series.name ?? `${teamName} · ${series.label}`}
      </div>
      {ranked ? (
        // The team: a small table — season over value over MLB rank chip, "MLB rank" as the row label.
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12 * L.k, marginTop: 4 * L.k, fontFamily: "Gabriela", color: C.navy }}>
          <div style={{ display: "flex", fontFamily: prose(zh), fontSize: L.sub * 0.9, color: navyA(0.55), paddingBottom: 1 * L.k }}>{c.rankLabel}</div>
          {series.points.map((p, i) => (
            <div key={p.season} style={{ display: "flex", alignItems: "center", gap: 12 * L.k }}>
              {i > 0 && <div style={{ fontSize: L.value * 0.6, color: navyA(0.45) }}>→</div>}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                <div style={{ fontSize: L.sub, color: navyA(0.55) }}>{String(p.season)}</div>
                <div style={{ fontSize: L.value * 0.75, lineHeight: 1.15 }}>{p.value}</div>
                {p.rank && (
                  <div
                    style={{
                      display: "flex",
                      fontFamily: prose(zh),
                      fontSize: L.sub * 0.9,
                      background: rankTintHex(p.rank.rank),
                      borderRadius: 4 * L.k,
                      padding: `${1 * L.k}px ${5 * L.k}px`,
                      marginTop: 2 * L.k,
                    }}
                  >
                    {p.rank.text}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 * L.k, marginTop: 2 * L.k, fontFamily: "Gabriela", color: C.navy }}>
          {series.points.map((p, i) => (
            <div key={p.season} style={{ display: "flex", alignItems: "baseline", gap: 6 * L.k }}>
              {i > 0 && <div style={{ fontSize: L.value * 0.6, color: navyA(0.45) }}>→</div>}
              <div style={{ fontSize: L.sub, color: navyA(0.55) }}>{String(p.season)}</div>
              <div style={{ fontSize: L.value * 0.75 }}>{p.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A Baseball 101 example as a small table: column heads (seasons or stats), then a row per player
 * (name + an optional position tag) or per line of the record. Values right-aligned, as on the site's tables.
 */
function ExampleTableBody({ table, teamName, c }: { table: ExampleTable; teamName: string; c: Ctx }) {
  const { L, zh } = c;
  const cell = L.value * (L.portrait ? 0.65 : 0.6);
  const lab = L.sub * (L.portrait ? 1.2 : 1.1);
  const tagSize = L.sub * 0.85;
  const gap = 14 * L.k;
  // Names never wrap (nowrap + 30% slack over the width estimate); the position tag has its own column so the tags line up.
  const labelW = Math.ceil(Math.max(...table.rows.map((r) => textWidth(r.label, lab))) * 1.3);
  const tagW = table.rows.some((r) => r.tag) ? Math.ceil(Math.max(...table.rows.map((r) => textWidth(r.tag ?? "", tagSize))) * 1.3) : 0;
  const colW = Math.ceil(Math.max(...table.cols.map((h) => textWidth(h, L.sub)), ...table.rows.flatMap((r) => r.cells.map((v) => textWidth(v, cell)))) * 1.15);
  return (
    <div style={{ display: "flex", flexDirection: "column", color: C.navy }}>
      <div style={{ fontFamily: prose(zh), fontSize: L.sub * 1.25, marginTop: 2 * L.k }}>{table.title ?? teamName}</div>
      <div
        style={{
          display: "flex",
          gap,
          marginTop: 4 * L.k,
          paddingBottom: 2 * L.k,
          borderBottom: `${1 * L.k}px solid ${navyA(0.2)}`,
          fontFamily: "Gabriela",
          fontSize: L.sub,
          color: navyA(0.55),
        }}
      >
        <div style={{ display: "flex", width: labelW }} />
        {tagW > 0 && <div style={{ display: "flex", width: tagW }} />}
        {table.cols.map((h) => (
          <div key={h} style={{ display: "flex", justifyContent: "flex-end", width: colW }}>
            {h}
          </div>
        ))}
      </div>
      {table.rows.map((r) => (
        <div key={r.label} style={{ display: "flex", alignItems: "baseline", gap, marginTop: 3 * L.k }}>
          <div style={{ display: "flex", width: labelW, flexShrink: 0, whiteSpace: "nowrap", fontFamily: hasCjk(r.label) ? "Noto Serif TC" : "Gabriela", fontSize: lab }}>
            {nbHyphens(r.label, zh)}
          </div>
          {tagW > 0 && <div style={{ display: "flex", width: tagW, flexShrink: 0, fontFamily: "Gabriela", fontSize: tagSize, color: navyA(0.5) }}>{r.tag ?? ""}</div>}
          {r.cells.map((v, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "flex-end", width: colW, fontFamily: "Gabriela", fontSize: cell, lineHeight: 1.15 }}>
              {nbHyphens(v, false)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function GlossaryBody({ spec, example, c, exampleTitle, teamName }: { spec: GlossaryCard; example: ResolvedExample | ExampleTable | null; c: Ctx; exampleTitle: string; teamName: string }) {
  const number = `NO. ${String(spec.number).padStart(3, "0")}`;
  const { L, S, zh } = c;
  const ink = (a: number) => softInk(S, a);
  const definition = pick(spec.definition, c.locale);
  const inner = L.W - 2 * L.m - 2 * L.pad[1];
  const termSize = L.portrait ? fit(spec.term, inner, 1, [190, 160, 130]) : fit(spec.term, inner * 0.58, 1, [118, 100, 84]);
  const defWidth = L.portrait ? inner : inner * 0.58;
  // Portrait: about 5 lines fit above the scale tiles and the example at 40px (7 overflowed it). Landscape: the
  // column holds 5.5 at 27px; a single paragraph counts whole lines, so for it that's still 5.
  const defSize = L.portrait ? fit(definition, defWidth, 5, [40, 36, 32]) : fit(definition, defWidth, 5.5, [27, 25, 23, 21]);
  const scale = spec.scale ?? [];
  const series = example && "points" in example ? example : null;
  const table = example && "rows" in example ? example : null;
  // Landscape scale rows: the value column fits the widest value (38.6% is wider than 100).
  const scaleW = Math.max(L.value * 1.7, ...scale.map((s) => Math.ceil(textWidth(s.value, L.value * 0.72) * 1.15)));

  const exampleCard = example && (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: S.card,
        border: `${1.5 * L.k}px solid ${S.cardBorder}`,
        borderRadius: 8 * L.k,
        padding: `${10 * L.k}px ${14 * L.k}px`,
      }}
    >
      <div style={{ fontFamily: zh ? "Noto Serif TC" : "Graduate", fontSize: L.label, letterSpacing: 1.5, color: navyA(0.55), textTransform: "uppercase" }}>
        {exampleTitle}
      </div>
      {series ? <ExampleSeries series={series} teamName={teamName} c={c} /> : table && <ExampleTableBody table={table} teamName={teamName} c={c} />}
    </div>
  );

  const left = (
    <div style={{ display: "flex", flexDirection: "column", ...(L.portrait ? {} : { width: inner * 0.6 }) }}>
      {L.portrait && (
        <div style={{ fontFamily: "Graduate", fontSize: L.tag * 0.9, letterSpacing: 2, color: ink(0.6), marginBottom: 8 * L.k }}>{number}</div>
      )}
      <div style={{ fontFamily: "Gabriela", fontSize: termSize, lineHeight: 1, color: S.ink }}>{spec.term}</div>
      {spec.aka && <div style={{ fontFamily: "Gabriela", fontSize: L.sub * 1.3, color: ink(0.65), marginTop: 6 * L.k }}>{spec.aka}</div>}
      <div style={{ display: "flex", marginTop: L.gap * 0.9 }}>
        <Rule color={S.rule} width={L.portrait ? 260 : 170} L={L} seed={c.seed + 21} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", fontFamily: prose(zh), fontSize: defSize, lineHeight: 1.45, color: S.ink, marginTop: L.gap * 0.9 }}>
        <Lines text={definition} zh={zh} size={defSize} width={defWidth} />
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
              <NoteCard key={s.value} value={s.value} label={pick(s.label, c.locale)} S={S} zh={zh} L={L} />
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
              background: S.card,
              border: `${1.5 * L.k}px solid ${S.cardBorder}`,
              borderRadius: 8 * L.k,
              padding: `${5 * L.k}px ${12 * L.k}px`,
            }}
          >
            <div style={{ fontFamily: "Gabriela", fontSize: L.value * 0.72, color: C.navy, width: scaleW, flexShrink: 0 }}>{s.value}</div>
            <div style={{ fontFamily: prose(zh), fontSize: L.sub * 1.1, color: navyA(0.65) }}>{pick(s.label, c.locale).replace(/\n/g, " ")}</div>
          </div>
        ))}
        {exampleCard}
      </div>
    </div>
  );
}

/** A series part: series name, the takeaway, a sentence or two, then up to 3 tiles (live stat cards, then facts). */
function PartBody({ spec, stats, c }: { spec: PartCard; stats: CardStat[]; c: Ctx }) {
  const { L, S, zh } = c;
  const title = pick(spec.title, c.locale);
  const text = spec.text ? pick(spec.text, c.locale) : null;
  const inner = L.W - 2 * L.m - 2 * L.pad[1];
  const tSize = L.portrait ? fit(title, inner, 3, [84, 76, 68, 60]) : fit(title, inner, 2, [52, 46, 42, 38]);
  const dSize = L.portrait ? fit(text ?? "", inner, 5, [38, 34, 30]) : fit(text ?? "", inner, 2, [25, 23, 21]);
  const facts = spec.facts.map((f) => (
    <NoteCard key={f.value + pick(f.label, "en")} value={f.value} label={pick(f.label, c.locale)} S={S} zh={zh} L={L} row={L.portrait} flex={!L.portrait} />
  ));
  const statCards = stats.map((s) => <StatCard key={s.label} stat={s} rankLabel={c.rankLabel} S={S} zh={zh} L={L} grow={!L.portrait} />);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          fontFamily: zh ? "Noto Serif TC" : "Graduate",
          fontWeight: zh ? 700 : 400,
          fontSize: L.tag * 0.9,
          letterSpacing: 2,
          color: softInk(S, 0.6),
          textTransform: "uppercase",
          marginTop: L.gap * (L.portrait ? 1.2 : 0.4),
        }}
      >
        {pick(spec.series, c.locale)}
      </div>
      <div style={{ display: "flex", fontFamily: prose(zh), fontWeight: zh ? 700 : 400, fontSize: tSize, lineHeight: 1.2, color: S.ink, marginTop: L.gap * 0.4, ...titleRow(zh) }}>
        {titleContent(title, zh, tSize, inner)}
      </div>
      <div style={{ display: "flex", marginTop: L.gap * 0.7 }}>
        <Rule color={S.rule} width={L.portrait ? 260 : 170} L={L} seed={c.seed + 21} />
      </div>
      {text && (
        <div style={{ display: "flex", fontFamily: prose(zh), fontSize: dSize, lineHeight: 1.45, color: softInk(S, 0.85), marginTop: L.gap * 0.7 }}>{nbHyphens(text, zh)}</div>
      )}
      {L.portrait ? (
        <div style={{ display: "flex", flexDirection: "column", gap: L.gap, marginTop: L.gap * 1.4 }}>
          {statCards}
          {facts}
        </div>
      ) : (
        statCards.length + facts.length > 0 && (
          <div style={{ display: "flex", gap: L.gap, marginTop: L.gap * 1.1 }}>
            {statCards}
            {facts}
          </div>
        )
      )}
    </div>
  );
}

function NewsBody({ spec, c }: { spec: NewsCard; c: Ctx }) {
  const { L, S, zh } = c;
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
      <div style={{ display: "flex", fontFamily: prose(zh), fontWeight: zh ? 700 : 400, fontSize: hSize, lineHeight: 1.2, color: S.ink, ...titleRow(zh) }}>{titleContent(headline, zh, hSize, textW)}</div>
      <div style={{ display: "flex", marginTop: L.gap * 0.8 }}>
        <Rule color={S.rule} width={L.portrait ? 260 : 170} L={L} seed={c.seed + 21} />
      </div>
      {deck && (
        <div style={{ display: "flex", fontFamily: prose(zh), fontSize: dSize, lineHeight: 1.45, color: softInk(S, 0.85), marginTop: L.gap * 0.8 }}>{nbHyphens(deck, zh)}</div>
      )}
    </div>
  );
  const factRow = facts.length > 0 && (
    <div style={{ display: "flex", flexDirection: "row", gap: L.gap, marginTop: L.gap * (L.portrait ? 1.6 : 1.1) }}>
      {facts.map((f) => (
        <NoteCard key={f.value + pick(f.label, "en")} value={f.value} label={pick(f.label, c.locale)} S={S} zh={zh} L={L} />
      ))}
    </div>
  );
  const stampEl = <Stamp big={stamp.big} small={stamp.small} color={S.stamp} zh={zh} L={L} seed={c.seed + 31} />;

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

/** A Baseball 101 example from the DB: one value per season (a Jay or the team), several Jays in one season, or the record vs expected. */
function resolveExample(ex: GlossaryExample, locale: string): Promise<ResolvedExample | ExampleTable | null> {
  if ("players" in ex) return resolvePlayersExample(ex, locale);
  if ("team" in ex) return ex.stat === "x_wl" ? resolveRecordExample(ex, locale) : resolveTeamExample(ex, locale);
  return resolvePlayerExample(ex);
}

/** Every string on the card, for subsetting the fonts. */
function allText(spec: CardSpec, extra: string[]): string {
  return [JSON.stringify(spec), SITE.name, SITE.name.toUpperCase(), siteHost(), "→0123456789−+.%\u2011", ...extra].join("");
}

export async function renderShareCard(spec: CardSpec, opts: CardOptions): Promise<ImageResponse> {
  const L = layout(opts.size);
  const locale = opts.locale === "zh-TW" ? "zh-TW" : "en";
  const zh = locale === "zh-TW";
  const S = KIND[spec.kind];
  const seed = seedFrom(spec.kind === "part" ? `part:${spec.slug}:${spec.index}` : `${spec.kind}:${spec.slug}`);

  const [tA, tS, tC, logo] = await Promise.all([
    getTranslations({ locale, namespace: "Articles" }),
    getTranslations({ locale, namespace: "Season" }),
    getTranslations({ locale, namespace: "ShareCard" }),
    capLogo(S),
  ]);
  const [stats, example] = await Promise.all([
    (spec.kind === "article" || spec.kind === "part") && spec.season && spec.stats.length > 0
      ? resolveCardStats(spec.season, spec.stats, locale)
      : Promise.resolve([] as CardStat[]),
    spec.kind === "glossary" && spec.example ? resolveExample(spec.example, locale) : Promise.resolve(null),
  ]);

  const byline = tA("byline", { author: SITE.author });
  const date = dateFmt(locale, spec.date, { dateStyle: "medium" });
  const tag = S.tag[locale];
  const numberText = spec.kind === "glossary" ? tC("number", { n: String(spec.number).padStart(3, "0") }) : "";
  const footerLeft =
    spec.kind === "news"
      ? `${tC("source", { source: spec.source })} · ${date}`
      : `${byline} · ${date}`;
  const strings = [
    byline,
    date,
    tag,
    S.tag.en.toUpperCase(),
    numberText,
    footerLeft,
    tS("rankLabel"),
    tC("example"),
    tC("teamExample"),
    ...stats.flatMap((s) => [s.label, s.label.toUpperCase(), s.value, s.delta?.text ?? "", s.rank?.text ?? "", s.prior ?? ""]),
    !example
      ? ""
      : "rows" in example
        ? [example.title ?? "", ...example.cols, ...example.rows.flatMap((r) => [r.label, r.tag ?? "", ...r.cells])].join("")
        : `${example.name ?? ""}${example.label}${example.points.map((p) => `${p.season}${p.value}${p.rank?.text ?? ""}`).join("")}`,
  ];
  const text = allText(spec, strings);

  const fonts = await cardFonts(text, zh);
  // No Chinese face, no Chinese card: the English one beats boxes for glyphs.
  if (!fonts) return renderShareCard(spec, { ...opts, locale: "en" });

  const c: Ctx = { L, S, zh, locale, logo, seed, byline, rankLabel: tS("rankLabel") };
  const body =
    spec.kind === "article" ? (
      <ArticleBody spec={spec} stats={stats} c={c} />
    ) : spec.kind === "glossary" ? (
      <GlossaryBody spec={spec} example={example} c={c} exampleTitle={tC("example")} teamName={tC("teamExample")} />
    ) : spec.kind === "part" ? (
      <PartBody spec={spec} stats={stats} c={c} />
    ) : (
      <NewsBody spec={spec} c={c} />
    );

  const counter = (text: string) => (
    <div style={{ display: "flex", fontFamily: "Graduate", fontSize: L.tag * 0.9, letterSpacing: 2, color: softInk(S, 0.6) }}>{text}</div>
  );
  const headerExtra =
    spec.kind === "glossary" && !L.portrait
      ? counter(`NO. ${String(spec.number).padStart(3, "0")}`)
      : spec.kind === "part"
        ? counter(`${spec.index} / ${spec.total}`)
        : undefined;

  return new ImageResponse(
    (
      <Card L={L} seed={seed} S={S} tag={tag} zh={zh} logo={logo} headerExtra={headerExtra} footerLeft={footerLeft}>
        {body}
      </Card>
    ),
    { width: L.W, height: L.H, fonts },
  );
}

/**
 * The site's default link preview (every page without its own image): the
 * wordmark, the site's one-line description in the reader's language and the
 * cap, on the article cards' parchment and frame.
 */
export async function renderSiteCard(locale: string): Promise<ImageResponse> {
  const L = layout("og");
  const zh = locale === "zh-TW";
  const S = PAPERS.parchment;
  const seed = seedFrom("site");
  const tagline = (await getTranslations({ locale: zh ? "zh-TW" : "en", namespace: "Home" }))("subtitle");
  const [logo, fonts] = await Promise.all([capLogo(S), cardFonts(`${SITE.name}${tagline}${siteHost()}`, zh)]);
  if (!fonts) return renderSiteCard("en");

  return new ImageResponse(
    (
      <Sheet L={L} S={S} seed={seed}>
        <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 40, padding: "0 8px" }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ fontFamily: "Graduate", fontSize: 76, lineHeight: 1.05, letterSpacing: 2, color: S.ink }}>
              {SITE.name.toUpperCase()}
            </div>
            <div style={{ display: "flex", marginTop: 22 }}>
              <Rule color={S.rule} width={220} L={L} seed={seed + 21} />
            </div>
            <div style={{ display: "flex", fontFamily: prose(zh), fontSize: 32, lineHeight: 1.35, color: S.ink, marginTop: 22 }}>{tagline}</div>
            <div style={{ fontFamily: "Gabriela", fontSize: 24, color: softInk(S, 0.55), marginTop: 28 }}>{siteHost()}</div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img> */}
          <img src={logo} width={250} height={250} alt="" />
        </div>
      </Sheet>
    ),
    { width: L.W, height: L.H, fonts },
  );
}
