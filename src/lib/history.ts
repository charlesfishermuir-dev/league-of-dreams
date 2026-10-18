import { cache } from "react";
import { fetchAll, supabase } from "./supabase";

export type Stats = Record<string, number>;

export type Franchise = { id: number; slug: string; name: string; active: boolean };
export type Manager = { id: number; name: string; slug: string };
export type Season = {
  year: number;
  league_name: string | null;
  num_teams: number;
  categories: string[];
  notes: string | null;
  is_current: boolean;
  current_period: number | null;
};
export type Finish = "champion" | "runner_up" | "third" | "fourth" | "semifinal" | null;
export type TeamSeason = {
  id: number;
  year: number;
  franchise_id: number;
  manager_id: number | null;
  manager_label: string;
  team_name: string;
  place: number;
  wins: number;
  losses: number;
  ties: number;
  finish: Finish;
  playoff_seed: number | null;
  stats: Stats;
};
export type Matchup = {
  id: number;
  year: number;
  period: number | null;
  stage: "regular" | "semifinal" | "final" | "third_place";
  home_id: number;
  away_id: number;
  home_seed: number | null;
  away_seed: number | null;
  home_w: number;
  home_l: number;
  home_t: number;
  home_stats: Stats;
  away_stats: Stats;
  winner_id: number | null;
  status: "final" | "live" | "upcoming";
  /** 2020 only: every team played every other team each week. */
  all_play: boolean;
};

export type History = {
  franchises: Franchise[];
  managers: Manager[];
  seasons: Season[];
  teamSeasons: TeamSeason[];
  matchups: Matchup[];
  franchiseById: Map<number, Franchise>;
  /** The team-season for a franchise in a year: `${year}:${franchiseId}`. */
  teamSeason: Map<string, TeamSeason>;
};

/** All history, loaded once per request. The whole league fits in a few hundred rows. */
export const loadHistory = cache(async (): Promise<History> => {
  const [franchises, managers, seasons, teamSeasons, matchups] = await Promise.all([
    fetchAll<Franchise>("franchises"),
    fetchAll<Manager>("managers"),
    supabase.from("seasons").select("*").order("year").then(({ data, error }) => {
      if (error) throw new Error(`Loading seasons: ${error.message}`);
      return data as Season[];
    }),
    fetchAll<TeamSeason>("team_seasons"),
    fetchAll<Matchup>("matchups"),
  ]);
  return {
    franchises,
    managers,
    seasons,
    teamSeasons,
    matchups,
    franchiseById: new Map(franchises.map((f) => [f.id, f])),
    teamSeason: new Map(teamSeasons.map((t) => [`${t.year}:${t.franchise_id}`, t])),
  };
});

// ---------- small helpers ----------

/** Win % counting a tie as half a win (how the league has always shown it). */
export function winPct(w: number, l: number, t: number): number {
  const games = w + l + t;
  return games ? (w + t / 2) / games : 0;
}

export const fmtPct = (p: number) => p.toFixed(3).replace(/^0/, "");
export const fmtRecord = (w: number, l: number, t: number) => `${Math.round(w)}-${Math.round(l)}-${Math.round(t)}`;

/** Categories where a lower number is better. */
export const LOWER_IS_BETTER = new Set(["ERA", "WHIP", "L"]);
/**
 * 2020 was a 60-game COVID season played "all-play": every team faced all 11
 * others every week, so its records are ~3.5x the size of a normal season's.
 * The rules for counting it (explained on the History page) live here:
 *  - all-time totals: scaled down to one normal season, keeping the win %
 *  - single-season records and leaderboards: left out
 *  - head-to-head: all-play weeks left out (see headToHead)
 */
export const SHORT_SEASON = 2020;
/** A normal season's record size: 22 weeks x 12 categories. */
export const NORMAL_SEASON_DECISIONS = 264;

export type Record3 = { w: number; l: number; t: number };

/** A team-season's record as it counts toward all-time totals. */
export function countedRecord(ts: TeamSeason): Record3 {
  const games = ts.wins + ts.losses + ts.ties;
  const k = ts.year === SHORT_SEASON && games > 0 ? NORMAL_SEASON_DECISIONS / games : 1;
  return { w: ts.wins * k, l: ts.losses * k, t: ts.ties * k };
}

/** All-time record across several team-seasons, with 2020 counted as one normal season. */
export function allTimeRecord(seasons: TeamSeason[]): Record3 & { pct: number } {
  const r = seasons.map(countedRecord).reduce((a, b) => ({ w: a.w + b.w, l: a.l + b.l, t: a.t + b.t }), { w: 0, l: 0, t: 0 });
  return { ...r, pct: winPct(r.w, r.l, r.t) };
}

/** Single-season record books leave 2020 out. */
export const inSeasonRecords = (ts: TeamSeason) => ts.year !== SHORT_SEASON;
/** First season with the extra INF roster spot. */
export const INF_SPOT_YEAR = 2021;

export function fmtStat(cat: string, value: number | undefined): string {
  if (value === undefined || value === null) return "–";
  if (cat === "AVG" || cat === "OPS") return value.toFixed(3).replace(/^0/, "");
  if (cat === "ERA" || cat === "WHIP") return value.toFixed(2);
  return value.toLocaleString("en-US");
}

export const FINISH_LABEL: Record<NonNullable<Finish>, string> = {
  champion: "Champion",
  runner_up: "Runner-up",
  third: "3rd",
  fourth: "4th",
  semifinal: "Semifinal",
};

export const STAGE_LABEL: Record<Matchup["stage"], string> = {
  regular: "Regular season",
  semifinal: "Semifinal",
  final: "Championship",
  third_place: "3rd-place game",
};

export const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// ---------- derived views ----------

export type ManagerTotals = {
  manager: string;
  managerSlug: string;
  franchiseSlugs: string[];
  latestTeam: string;
  seasons: number;
  first: number;
  last: number;
  w: number;
  l: number;
  t: number;
  pct: number;
  rings: number[];
  runnerUps: number[];
  playoffs: number[];
  active: boolean;
};

export function managerTotals(h: History): ManagerTotals[] {
  const byManager = new Map<string, ManagerTotals>();
  const managerSlug = new Map(h.managers.map((m) => [m.name, m.slug]));
  const sorted = [...h.teamSeasons].sort((a, b) => a.year - b.year);
  for (const ts of sorted) {
    const key = ts.manager_label;
    const f = h.franchiseById.get(ts.franchise_id)!;
    let m = byManager.get(key);
    if (!m) {
      m = {
        manager: key, managerSlug: managerSlug.get(key) ?? "", franchiseSlugs: [], latestTeam: "",
        seasons: 0, first: ts.year, last: ts.year, w: 0, l: 0, t: 0, pct: 0,
        rings: [], runnerUps: [], playoffs: [], active: false,
      };
      byManager.set(key, m);
    }
    m.seasons++;
    m.last = ts.year;
    m.latestTeam = ts.team_name;
    const r = countedRecord(ts);
    m.w += r.w;
    m.l += r.l;
    m.t += r.t;
    if (!m.franchiseSlugs.includes(f.slug)) m.franchiseSlugs.push(f.slug);
    if (ts.finish === "champion") m.rings.push(ts.year);
    if (ts.finish === "runner_up") m.runnerUps.push(ts.year);
    if (ts.finish) m.playoffs.push(ts.year);
  }
  const lastYear = Math.max(...h.teamSeasons.map((t) => t.year));
  for (const m of byManager.values()) {
    m.pct = winPct(m.w, m.l, m.t);
    m.active = m.last === lastYear;
  }
  return [...byManager.values()];
}

export type H2HRow = { opponent: string; w: number; l: number; t: number; meetings: number };

/** Head-to-head matchup records for one manager against everyone they've faced. */
export function headToHead(h: History, manager: string, stages?: Matchup["stage"][]): H2HRow[] {
  const rows = new Map<string, H2HRow>();
  for (const m of h.matchups) {
    if (stages && !stages.includes(m.stage)) continue;
    if (m.all_play || m.status !== "final") continue;
    const home = h.teamSeason.get(`${m.year}:${m.home_id}`)?.manager_label;
    const away = h.teamSeason.get(`${m.year}:${m.away_id}`)?.manager_label;
    if (!home || !away || (home !== manager && away !== manager)) continue;
    const isHome = home === manager;
    const opponent = isHome ? away : home;
    const myId = isHome ? m.home_id : m.away_id;
    const row = rows.get(opponent) ?? { opponent, w: 0, l: 0, t: 0, meetings: 0 };
    row.meetings++;
    if (m.winner_id === null) row.t++;
    else if (m.winner_id === myId) row.w++;
    else row.l++;
    rows.set(opponent, row);
  }
  return [...rows.values()].sort((a, b) => b.meetings - a.meetings || a.opponent.localeCompare(b.opponent));
}

export function champions(h: History) {
  return h.seasons.map((s) => {
    const teams = h.teamSeasons.filter((t) => t.year === s.year);
    return {
      season: s,
      champion: teams.find((t) => t.finish === "champion"),
      runnerUp: teams.find((t) => t.finish === "runner_up"),
      regularSeasonWinner: teams.find((t) => t.place === 1),
    };
  });
}
