import { cache } from "react";
import { supabase } from "./supabase";
import { loadHistory, type Matchup, type TeamSeason } from "./history";

export type Period = {
  year: number;
  period: number;
  label: string;
  start_date: string | null;
  end_date: string | null;
  is_playoffs: boolean;
};
export type SyncStatus = { dataset: string; last_attempt: string | null; last_success: string | null; ok: boolean | null; message: string | null };
export type RosterPlayer = {
  franchise_id: number;
  player_id: string;
  name: string;
  positions: string | null;
  slot: string | null;
  status: "active" | "reserve" | "injured" | "minors" | "other";
  mlb_team: string | null;
  headshot_url: string | null;
  stats: Record<string, string>; // season stats as shown on Fantrax, e.g. { HR: "27", AVG: ".275" }
};
export type Transaction = {
  id: number;
  fantrax_set_id: string;
  occurred_at: string | null;
  type: string;
  franchise_id: number | null;
  from_franchise_id: number | null;
  player_name: string;
  player_positions: string | null;
  player_mlb_team: string | null;
};

async function rows<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>, what: string): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`Loading ${what}: ${error.message}`);
  return (data ?? []) as T[];
}

/** The season shown on the live pages, with its weeks and matchups. */
export const loadCurrentSeason = cache(async () => {
  const h = await loadHistory();
  const season = h.seasons.find((s) => s.is_current) ?? h.seasons.at(-1)!;
  const year = season.year;
  const [periods, matchups, logos, sync] = await Promise.all([
    rows<Period>(supabase.from("periods").select("*").eq("year", year).order("period"), "periods"),
    rows<Matchup>(supabase.from("matchups").select("*").eq("year", year).order("period").order("id"), "matchups"),
    rows<{ franchise_id: number; logo_url: string | null; short_name: string | null }>(
      supabase.from("fantrax_teams").select("franchise_id, logo_url, short_name").eq("year", year), "team logos"),
    rows<SyncStatus>(supabase.from("sync_status").select("*"), "sync status"),
  ]);
  const currentPeriod = season.current_period ?? periods.at(-1)?.period ?? 1;
  return {
    h,
    season,
    year,
    periods,
    matchups,
    currentPeriod,
    teams: h.teamSeasons.filter((t) => t.year === year).sort((a, b) => a.place - b.place),
    logo: new Map(logos.map((l) => [l.franchise_id, l.logo_url])),
    shortName: new Map(logos.map((l) => [l.franchise_id, l.short_name])),
    sync: new Map(sync.map((s) => [s.dataset, s])),
  };
});

export async function loadRoster(year: number, franchiseId: number) {
  return rows<RosterPlayer>(
    supabase.from("rosters").select("*").eq("year", year).eq("franchise_id", franchiseId).order("id"), "roster");
}

/** Specific players on this season's rosters, by name (for spotlights). */
export async function loadPlayersByName(year: number, names: string[]) {
  return rows<RosterPlayer>(supabase.from("rosters").select("*").eq("year", year).in("name", names), "players");
}

/** Fantrax's large headshot (the roster gives the 96px one). */
export const bigHeadshot = (url: string) => url.replace(/_96_/, "_400_");

/** The most recent transactions, grouped so a claim and its drop show together. */
export async function loadRecentTransactions(limit = 40) {
  const list = await rows<Transaction>(
    supabase.from("transactions").select("*").neq("type", "lineup_change")
      .order("occurred_at", { ascending: false }).order("id").limit(limit),
    "transactions",
  );
  const groups = new Map<string, Transaction[]>();
  for (const t of list) groups.set(t.fantrax_set_id, [...(groups.get(t.fantrax_set_id) ?? []), t]);
  return [...groups.values()];
}

// ---------- standings helpers ----------

export type StandingRow = {
  ts: TeamSeason;
  gb: number;
  streak: string;
  catFor: number;
  catAgainst: number;
  lastWeek: { result: "W" | "L" | "T"; score: string; opponentId: number } | null;
};

export function standingsRows(teams: TeamSeason[], matchups: Matchup[]): StandingRow[] {
  const regular = matchups.filter((m) => m.stage === "regular" && m.status === "final" && !m.all_play);
  const leader = teams[0];
  const leaderNet = leader ? leader.wins - leader.losses : 0;
  return teams.map((ts) => {
    const mine = regular
      .filter((m) => m.home_id === ts.franchise_id || m.away_id === ts.franchise_id)
      .sort((a, b) => (a.period ?? 0) - (b.period ?? 0));
    const results = mine.map((m) => {
      const isHome = m.home_id === ts.franchise_id;
      const [w, l] = isHome ? [m.home_w, m.home_l] : [m.home_l, m.home_w];
      return {
        result: (m.winner_id === null ? "T" : m.winner_id === ts.franchise_id ? "W" : "L") as "W" | "L" | "T",
        score: `${w}-${l}${m.home_t ? `-${m.home_t}` : ""}`,
        opponentId: isHome ? m.away_id : m.home_id,
      };
    });
    let streak = "";
    if (results.length) {
      const last = results.at(-1)!.result;
      let n = 0;
      for (let i = results.length - 1; i >= 0 && results[i].result === last; i--) n++;
      streak = `${last}${n}`;
    }
    return {
      ts,
      gb: (leaderNet - (ts.wins - ts.losses)) / 2,
      streak,
      catFor: ts.wins + ts.ties / 2,
      catAgainst: ts.losses + ts.ties / 2,
      lastWeek: results.at(-1) ?? null,
    };
  });
}

// ---------- formatting ----------

const CENTRAL = "America/Chicago";

export function fmtUpdated(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return d.toLocaleString("en-US", { timeZone: CENTRAL, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " CT";
}

export function fmtDateRange(p: Period | undefined): string {
  if (!p?.start_date || !p.end_date) return "";
  const f = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${f(p.start_date)} – ${f(p.end_date)}`;
}

export function fmtDay(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { timeZone: CENTRAL, month: "short", day: "numeric" });
}
