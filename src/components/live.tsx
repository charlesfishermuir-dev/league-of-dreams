/* eslint-disable @next/next/no-img-element -- team logos come from Fantrax's image server */
import Link from "next/link";
import { Card } from "@/components/ui";
import { fmtStat, LOWER_IS_BETTER, STAGE_LABEL, type History, type Matchup } from "@/lib/history";
import { fmtUpdated, type SyncStatus } from "@/lib/live";

export function TeamLogo({ url, name, size = 32 }: { url?: string | null; name: string; size?: number }) {
  if (!url) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-md bg-navy-700 font-display text-xs font-bold"
        style={{ width: size, height: size }}
        aria-hidden
      >
        {name.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-md bg-navy-800 object-cover" style={{ width: size, height: size }} />;
}

export function StatusChip({ status }: { status: Matchup["status"] }) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded bg-red px-1.5 py-0.5 font-display text-[11px] font-bold uppercase tracking-wider text-white">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden />
        Live
      </span>
    );
  }
  return (
    <span className={`rounded px-1.5 py-0.5 font-display text-[11px] font-bold uppercase tracking-wider ${status === "final" ? "bg-chalk/90 text-ink" : "bg-navy-700 text-mute"}`}>
      {status === "final" ? "Final" : "Upcoming"}
    </span>
  );
}

/** "Updated 3 min ago", with a warning when the last sync failed. */
export function UpdatedLine({ status, label = "Updated" }: { status?: SyncStatus; label?: string }) {
  if (!status) return <p className="text-xs text-mute">Not synced from Fantrax yet.</p>;
  return (
    <p className="text-xs text-mute">
      {label} {fmtUpdated(status.last_success)}
      {status.ok === false && (
        <span className="ml-2 rounded bg-red/20 px-1.5 py-0.5 text-red" title={status.message ?? ""}>
          ⚠ Fantrax sync is failing — showing the last good data
        </span>
      )}
    </p>
  );
}

/**
 * A matchup as a broadcast score bug: two teams, category-win totals, and a
 * tap-to-open category-by-category breakdown (no JavaScript needed).
 */
export function MatchupCard({ m, h, logo, categories }: {
  m: Matchup;
  h: History;
  logo: Map<number, string | null>;
  categories: string[];
}) {
  const ts = (id: number) => h.teamSeason.get(`${m.year}:${id}`);
  const name = (id: number) => ts(id)?.team_name ?? h.franchiseById.get(id)!.name;
  const sides = [
    { id: m.away_id, w: m.home_l, stats: m.away_stats },
    { id: m.home_id, w: m.home_w, stats: m.home_stats },
  ];
  const leaderId = m.status === "final" ? m.winner_id : m.home_w > m.home_l ? m.home_id : m.home_l > m.home_w ? m.away_id : null;
  const hasStats = Object.keys(m.home_stats).length > 0;

  return (
    <Card className={`overflow-hidden ${m.status === "live" ? "border-red/70" : ""}`}>
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="font-display text-xs font-semibold uppercase tracking-wider text-mute">
          {m.stage === "regular" ? "" : STAGE_LABEL[m.stage]}
        </span>
        <StatusChip status={m.status} />
      </div>
      {sides.map((s) => {
        const ahead = leaderId === s.id;
        const f = h.franchiseById.get(s.id)!;
        return (
          <Link key={s.id} href={`/teams/${f.slug}`} className={`flex items-center gap-3 px-3 py-2 hover:bg-navy-800/60 ${leaderId && !ahead ? "text-mute" : ""}`}>
            <TeamLogo url={logo.get(s.id)} name={name(s.id)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{name(s.id)}</span>
              <span className="block truncate text-xs text-mute">{ts(s.id)?.manager_label}</span>
            </span>
            <span className={`font-display text-3xl font-bold leading-none num ${ahead ? "text-chalk" : ""}`}>
              {m.status === "upcoming" ? "–" : s.w}
            </span>
            {ahead && m.status === "final" && <span className="-ml-2 text-red" aria-label="winner">◀</span>}
          </Link>
        );
      })}
      {m.home_t > 0 && m.status !== "upcoming" && (
        <p className="px-3 pb-1 text-right text-xs text-mute">{m.home_t} tied</p>
      )}
      {hasStats && (
        <details className="group border-t border-line">
          <summary className="cursor-pointer list-none px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wider text-mute hover:text-chalk">
            <span className="group-open:hidden">Category breakdown ▾</span>
            <span className="hidden group-open:inline">Hide ▴</span>
          </summary>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line/60">
              {categories.map((c) => {
                const a = m.away_stats[c];
                const b = m.home_stats[c];
                const lower = LOWER_IS_BETTER.has(c);
                const awayWins = a !== undefined && b !== undefined && (lower ? a < b : a > b);
                const homeWins = a !== undefined && b !== undefined && (lower ? b < a : b > a);
                return (
                  <tr key={c}>
                    <td className={`w-2/5 px-3 py-1 text-right num ${awayWins ? "font-bold text-chalk" : "text-mute"}`}>{fmtStat(c, a)}</td>
                    <td className="w-1/5 py-1 text-center font-display text-xs font-semibold uppercase tracking-wider text-mute">{c}</td>
                    <td className={`w-2/5 px-3 py-1 num ${homeWins ? "font-bold text-chalk" : "text-mute"}`}>{fmtStat(c, b)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      )}
    </Card>
  );
}
