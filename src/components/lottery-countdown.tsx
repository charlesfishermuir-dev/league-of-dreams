"use client";

import { useEffect, useState } from "react";

/**
 * Counts down to the scheduled lottery. At zero it checks every few seconds
 * until the database has drawn it, then opens the reveal.
 */
export function LotteryCountdown({ year, runAt, lastError, compact = false }: {
  year: number;
  runAt: string;
  lastError?: string | null;
  compact?: boolean;
}) {
  const target = new Date(runAt).getTime();
  const [now, setNow] = useState<number | null>(null); // null until mounted, so server and browser agree
  const [waitingNote, setWaitingNote] = useState<string | null>(lastError ?? null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const left = now === null ? null : Math.max(0, target - now);
  const due = left === 0;

  useEffect(() => {
    if (!due) return;
    let stop = false;
    const check = async () => {
      try {
        const r = await fetch(`/api/lottery/${year}`, { cache: "no-store" });
        const j = await r.json();
        if (j.drawn) {
          window.location.href = `/draft/${year}?reveal=1`;
          return;
        }
        setWaitingNote(j.schedule?.last_error ?? null);
      } catch {
        /* network blip: try again */
      }
      if (!stop) setTimeout(check, 3000);
    };
    check();
    return () => {
      stop = true;
    };
  }, [due, year]);

  const parts = left === null ? null : {
    d: Math.floor(left / 86_400_000),
    h: Math.floor((left / 3_600_000) % 24),
    m: Math.floor((left / 60_000) % 60),
    s: Math.floor((left / 1000) % 60),
  };
  const when = new Date(runAt).toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className={`relative overflow-hidden rounded-lg border border-red/60 bg-gradient-to-br from-red/25 via-navy-900 to-ink ${compact ? "p-4" : "p-6"}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red">{year} Draft Lottery · {when} CT</p>
      {due ? (
        <>
          <p className={`font-display font-bold uppercase ${compact ? "text-3xl" : "text-5xl"}`}>Drawing now…</p>
          <p className="mt-1 text-sm text-mute">
            {waitingNote ? `Waiting on the commissioner: ${waitingNote}` : "The reveal will start automatically. Stay on this page."}
          </p>
        </>
      ) : (
        <>
          <div className={`mt-1 flex items-end gap-3 font-display font-bold num ${compact ? "text-4xl" : "text-6xl sm:text-7xl"}`} aria-live="off">
            {parts ? (
              <>
                {parts.d > 0 && <Unit value={String(parts.d)} label="days" />}
                <Unit value={pad(parts.h)} label="hrs" />
                <Unit value={pad(parts.m)} label="min" />
                <Unit value={pad(parts.s)} label="sec" />
              </>
            ) : (
              <span className="text-mute">--:--:--</span>
            )}
          </div>
          {!compact && <p className="mt-2 text-sm text-mute">The lottery runs itself at the buzzer. Keep this page open and the reveal starts automatically.</p>}
        </>
      )}
    </div>
  );
}

function Unit({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex flex-col items-center leading-none">
      <span>{value}</span>
      <span className="mt-1 font-sans text-[10px] font-semibold uppercase tracking-widest text-mute">{label}</span>
    </span>
  );
}
