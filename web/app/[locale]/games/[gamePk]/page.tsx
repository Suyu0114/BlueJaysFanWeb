import { notFound } from "next/navigation";
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  getGame,
  getGameBoxscore,
  type GameBattingLine,
  type GamePitchingLine,
} from "@/lib/games";

export const revalidate = 3600;

export default async function GameDetailPage({
  params,
}: {
  params: Promise<{ locale: string; gamePk: string }>;
}) {
  const { locale, gamePk } = await params;
  setRequestLocale(locale);

  const pk = Number(gamePk);
  if (!Number.isFinite(pk)) notFound();

  const t = await getTranslations("Game");
  const tCal = await getTranslations("Calendar");
  const format = await getFormatter();

  const [game, box] = await Promise.all([getGame(pk), getGameBoxscore(pk)]);
  if (!game) notFound();

  const jaysWon = game.result === "W";
  const [y, m, d] = game.game_date.split("-").map(Number);
  const dateLabel = format.dateTime(new Date(y, m - 1, d), { dateStyle: "long" });
  const sep = game.is_home ? tCal("vs") : tCal("at");

  const hasBoxscore = box.batting.length > 0 || box.pitching.length > 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Link
        href="/"
        className="text-xs text-navy/55 transition-colors hover:text-brick"
      >
        ‹ {tCal("title")}
      </Link>

      <div className="mt-2 flex items-center gap-3">
        {game.is_final && (
          <span
            className={`rounded px-2 py-0.5 text-sm font-bold text-papaya ${
              jaysWon ? "bg-steel" : "bg-brick"
            }`}
          >
            {game.result}
          </span>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-navy">
          {game.is_final ? (
            <>
              <span className={jaysWon ? "text-navy" : "text-navy/55"}>
                Blue Jays {game.jays_score}
              </span>
              {" – "}
              <span className={!jaysWon ? "text-navy" : "text-navy/55"}>
                {game.opp_score} {game.opponent_name}
              </span>
            </>
          ) : (
            <span className="text-navy">
              Blue Jays {sep} {game.opponent_name}
            </span>
          )}
        </h1>
      </div>

      <p className="mt-1 text-sm text-navy/60">
        {game.is_final ? t("final") : game.first_pitch_et ?? game.status}
        {" · "}
        {dateLabel}
        {game.venue ? ` · ${game.venue}` : ""}
      </p>

      {hasBoxscore ? (
        <div className="mt-6 space-y-8">
          <BattingTable
            rows={box.batting}
            title={t("battingTitle")}
            playerLabel={t("player")}
          />
          <PitchingTable
            rows={box.pitching}
            title={t("pitchingTitle")}
            playerLabel={t("player")}
          />
        </div>
      ) : (
        <p className="mt-6 text-navy/60">{t("noBoxscore")}</p>
      )}
    </div>
  );
}

const BATTING_COLS = ["AB", "R", "H", "2B", "3B", "HR", "RBI", "BB", "SO"] as const;
const PITCHING_COLS = ["IP", "H", "R", "ER", "BB", "SO", "HR", "P", "S"] as const;

function StatTh({ label }: { label: string }) {
  return (
    <th className="px-1.5 py-1.5 text-right font-medium">{label}</th>
  );
}

function NumTd({ v }: { v: number | null }) {
  // Counting stats render 0, not blank, the way a box score does.
  return <td className="px-1.5 py-1.5 text-right text-navy/80">{v ?? 0}</td>;
}

function PlayerTh({ label }: { label: string }) {
  return <th className="py-1.5 pr-2 text-left font-medium">{label}</th>;
}

function PlayerLink({ id, name }: { id: number; name: string }) {
  return (
    <Link
      href={`/players/${id}`}
      className="font-medium text-navy transition-colors hover:text-brick"
    >
      {name}
    </Link>
  );
}

function BattingTable({
  rows,
  title,
  playerLabel,
}: {
  rows: GameBattingLine[];
  title: string;
  playerLabel: string;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold text-navy">{title}</h2>
      <div className="overflow-x-auto rounded-lg border border-navy/10">
        <table className="w-full min-w-[34rem] text-sm tabular-nums">
          <thead>
            <tr className="border-b border-navy/15 bg-white/40 text-xs uppercase tracking-wide text-navy/55">
              <PlayerTh label={playerLabel} />
              {BATTING_COLS.map((h) => (
                <StatTh key={h} label={h} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.mlbam_id} className="border-b border-navy/5 last:border-0">
                <td className="py-1.5 pr-2 text-left">
                  <PlayerLink id={r.mlbam_id} name={r.name} />
                </td>
                <NumTd v={r.ab} />
                <NumTd v={r.r} />
                <NumTd v={r.h} />
                <NumTd v={r.doubles} />
                <NumTd v={r.triples} />
                <NumTd v={r.hr} />
                <NumTd v={r.rbi} />
                <NumTd v={r.bb} />
                <NumTd v={r.so} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PitchingTable({
  rows,
  title,
  playerLabel,
}: {
  rows: GamePitchingLine[];
  title: string;
  playerLabel: string;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold text-navy">{title}</h2>
      <div className="overflow-x-auto rounded-lg border border-navy/10">
        <table className="w-full min-w-[34rem] text-sm tabular-nums">
          <thead>
            <tr className="border-b border-navy/15 bg-white/40 text-xs uppercase tracking-wide text-navy/55">
              <PlayerTh label={playerLabel} />
              {PITCHING_COLS.map((h) => (
                <StatTh key={h} label={h} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.mlbam_id} className="border-b border-navy/5 last:border-0">
                <td className="py-1.5 pr-2 text-left">
                  <PlayerLink id={r.mlbam_id} name={r.name} />
                  {r.decision && (
                    <span className="ml-1 text-xs text-navy/50">({r.decision})</span>
                  )}
                </td>
                <td className="px-1.5 py-1.5 text-right text-navy/80">{r.ip}</td>
                <NumTd v={r.h} />
                <NumTd v={r.r} />
                <NumTd v={r.er} />
                <NumTd v={r.bb} />
                <NumTd v={r.so} />
                <NumTd v={r.hr} />
                <NumTd v={r.pitches} />
                <NumTd v={r.strikes} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
