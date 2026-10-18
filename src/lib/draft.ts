import { cache } from "react";
import { supabaseFresh as supabase } from "./supabase";
import type { History, TeamSeason } from "./history";

export const LOTTERY_SPOTS = 8;
export const ROUNDS = 5;

export type DraftOrderRow = { year: number; slot: number; franchise_id: number; how: "lottery" | "playoffs"; seed: number | null };
export type DraftPick = { year: number; pick: number; round: number; slot: number; player: string | null; franchise_id: number | null; origin_franchise_id: number | null };
export type Draft = { year: number; based_on: number; source: "sheet" | "site"; order: DraftOrderRow[] };
export type LotteryRecord = {
  year: number;
  run_at: string;
  entrants: { seed: number; franchise_id: number; team_name: string; balls: number; chance_first: number }[];
  draws: { pick: number; roll: number; out_of: number; franchise_id: number }[];
};
export type Entrant = { seed: number; ts: TeamSeason; balls: number | null };

async function rows<T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>, what: string): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw new Error(`Loading ${what}: ${error.message}`);
  return (data ?? []) as T[];
}

export const loadDrafts = cache(async () => {
  const [drafts, order, lotteries, odds] = await Promise.all([
    rows<Omit<Draft, "order">>(supabase.from("drafts").select("*").order("year", { ascending: false }), "drafts"),
    rows<DraftOrderRow>(supabase.from("draft_order").select("*").order("slot"), "draft order"),
    rows<LotteryRecord>(supabase.from("draft_lotteries").select("year, run_at, entrants, draws"), "lotteries"),
    rows<{ seed: number; balls: number | null }>(supabase.from("lottery_odds").select("*").order("seed"), "lottery odds"),
  ]);
  return {
    drafts: drafts.map((d) => ({ ...d, order: order.filter((o) => o.year === d.year) })) as Draft[],
    lotteries: new Map(lotteries.map((l) => [l.year, l])),
    odds: odds.map((o) => ({ seed: o.seed, balls: o.balls === null ? null : Number(o.balls) })),
  };
});

export type LotterySchedule = { year: number; run_at: string; status: "scheduled" | "done"; last_error: string | null };

export async function loadLotterySchedule(year: number): Promise<LotterySchedule | null> {
  const { data } = await supabase.from("lottery_schedule").select("year, run_at, status, last_error").eq("year", year).maybeSingle();
  return (data as LotterySchedule) ?? null;
}

export async function loadDraftPicks(year: number) {
  return rows<DraftPick>(supabase.from("draft_picks").select("*").eq("year", year).order("pick"), "draft picks");
}

/**
 * The next draft: the season it's based on, whether that season is finished,
 * and the 8 lottery teams (seed 1 = worst record). During the season these
 * are projected from the current standings (places 5-12).
 */
export function upcomingLottery(h: History, odds: { seed: number; balls: number | null }[]) {
  const season = h.seasons.find((s) => s.is_current) ?? h.seasons.at(-1)!;
  const teams = h.teamSeasons.filter((t) => t.year === season.year).sort((a, b) => a.place - b.place);
  const complete = teams.some((t) => t.finish === "champion");
  const out = (complete ? teams.filter((t) => !t.finish) : teams.slice(4)).sort((a, b) => b.place - a.place).slice(0, LOTTERY_SPOTS);
  const entrants: Entrant[] = out.map((ts, i) => ({ seed: i + 1, ts, balls: odds.find((o) => o.seed === i + 1)?.balls ?? null }));
  return { draftYear: season.year + 1, basedOn: season.year, complete, entrants, oddsSet: entrants.length > 0 && entrants.every((e) => e.balls) };
}

/** Playoff teams for picks 9-12: semifinal losers (worse record first), runner-up, champion. */
export function playoffSlots(h: History, year: number): TeamSeason[] {
  const teams = h.teamSeasons.filter((t) => t.year === year);
  const semis = teams.filter((t) => ["semifinal", "third", "fourth"].includes(t.finish ?? "")).sort((a, b) => b.place - a.place);
  return [...semis, ...teams.filter((t) => t.finish === "runner_up"), ...teams.filter((t) => t.finish === "champion")];
}

/**
 * Exact chance of each entrant landing each pick when all picks are drawn one
 * at a time, each draw weighted by the remaining teams' balls.
 * Returns probs[entrant][pick] (0-based).
 */
export function pickProbabilities(balls: number[]): number[][] {
  const n = balls.length;
  const probs = balls.map(() => new Array(n).fill(0));
  const reach = new Map<number, number>([[0, 1]]); // set of already-drawn teams (bitmask) -> probability
  for (let pick = 0; pick < n; pick++) {
    const next = new Map<number, number>();
    for (const [mask, p] of reach) {
      let left = 0;
      for (let i = 0; i < n; i++) if (!(mask & (1 << i))) left += balls[i];
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) continue;
        const q = (p * balls[i]) / left;
        probs[i][pick] += q;
        next.set(mask | (1 << i), (next.get(mask | (1 << i)) ?? 0) + q);
      }
    }
    reach.clear();
    for (const [k, v] of next) reach.set(k, v);
  }
  return probs;
}

export const fmtChance = (p: number) => (p >= 0.995 ? "100%" : p < 0.0005 ? "–" : p < 0.01 ? "<1%" : `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`);

export function draftTeamName(h: History, d: { based_on: number }, franchiseId: number) {
  return h.teamSeason.get(`${d.based_on}:${franchiseId}`)?.team_name ?? h.franchiseById.get(franchiseId)?.name ?? "?";
}

