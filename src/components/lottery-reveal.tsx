"use client";
/* eslint-disable @next/next/no-img-element -- team logos come from Fantrax */

import { useEffect, useState } from "react";

export type RevealPick = {
  pick: number;
  teamName: string;
  manager: string;
  logo: string | null;
  seed: number;
  chance: string; // chance this team had of landing this exact pick
};

const STEP_MS = 3500;

/**
 * Lottery reveal, broadcast style: picks are revealed from #8 up to #1, one at a
 * time, with a longer pause before the top two. Anyone can replay it.
 */
export function LotteryReveal({ picks, autoStart = false }: { picks: RevealPick[]; autoStart?: boolean }) {
  const ordered = [...picks].sort((a, b) => b.pick - a.pick); // 8 -> 1
  const [shown, setShown] = useState(autoStart ? 0 : ordered.length);
  const [running, setRunning] = useState(autoStart);

  useEffect(() => {
    if (!running) return;
    if (shown >= ordered.length) {
      setRunning(false);
      return;
    }
    const next = ordered[shown];
    const t = setTimeout(() => setShown((s) => s + 1), next.pick <= 2 ? STEP_MS * 1.6 : STEP_MS);
    return () => clearTimeout(t);
  }, [running, shown, ordered]);

  const start = () => {
    setShown(0);
    setRunning(true);
  };
  const upNext = running && shown < ordered.length ? ordered[shown] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!running && (
          <button onClick={start} className="btn">
            {shown >= ordered.length ? "▶ Replay the reveal" : "▶ Start the reveal"}
          </button>
        )}
        {running && (
          <button onClick={() => { setShown(ordered.length); setRunning(false); }} className="btn-quiet">
            Skip to results
          </button>
        )}
      </div>

      {upNext && (
        <div className="mb-3 overflow-hidden rounded-lg border border-red/60 bg-gradient-to-r from-red/25 to-navy-900 p-5 text-center">
          <p className="font-display text-sm font-semibold uppercase tracking-[0.3em] text-red">On the clock</p>
          <p className="font-display text-5xl font-bold uppercase">Pick #{upNext.pick}</p>
          <p className="mt-1 animate-pulse text-mute">The envelope, please…</p>
        </div>
      )}

      <ol className="space-y-2">
        {ordered.slice(0, shown).reverse().map((p) => {
          const moved = p.seed - p.pick; // how many spots better than their seed
          return (
            <li
              key={p.pick}
              className={`flex items-center gap-3 rounded-lg border p-3 ${p.pick === 1 ? "border-gold bg-gold/10" : "border-line bg-navy-900/80"}`}
              style={{ animation: "lod-drop 600ms ease-out" }}
            >
              <span className={`w-14 shrink-0 text-center font-display text-3xl font-bold num ${p.pick === 1 ? "text-gold" : ""}`}>#{p.pick}</span>
              {p.logo ? (
                <img src={p.logo} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-md bg-navy-800 object-cover" />
              ) : (
                <span className="h-11 w-11 shrink-0 rounded-md bg-navy-700" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-xl font-bold uppercase leading-tight">{p.teamName}</span>
                <span className="block truncate text-xs text-mute">
                  {p.manager} · seed {p.seed} · {p.chance} chance at this pick
                </span>
              </span>
              {moved !== 0 && (
                <span className={`shrink-0 rounded px-2 py-0.5 font-display text-sm font-bold ${moved > 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-red/20 text-red"}`}>
                  {moved > 0 ? `▲${moved}` : `▼${-moved}`}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
