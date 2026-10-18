import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { Flash } from "@/components/admin";
import { requireAdmin } from "@/lib/supabase-server";
import { loadHistory } from "@/lib/history";
import { fmtChance, LOTTERY_SPOTS, pickProbabilities, playoffSlots, upcomingLottery } from "@/lib/draft";
import { runLottery, saveLotteryOdds } from "../actions";

type Props = { searchParams: Promise<{ saved?: string; error?: string }> };

export default async function AdminLottery({ searchParams }: Props) {
  const { supabase } = await requireAdmin();
  const h = await loadHistory();
  const [{ data: oddsRows }, { data: existing }] = await Promise.all([
    supabase.from("lottery_odds").select("*").order("seed"),
    supabase.from("drafts").select("year"),
  ]);
  const odds = (oddsRows ?? []).map((o) => ({ seed: o.seed as number, balls: o.balls === null ? null : Number(o.balls) }));
  const up = upcomingLottery(h, odds);
  const alreadyRun = (existing ?? []).some((d) => d.year === up.draftYear);
  const first = up.oddsSet ? pickProbabilities(up.entrants.map((e) => e.balls!)).map((p) => p[0]) : null;
  const playoff = playoffSlots(h, up.basedOn);

  return (
    <>
      <PageTitle kicker="Commissioner" sub={<>Shown on the public <Link href="/draft" className="text-red hover:underline">Draft Lottery page</Link>.</>}>
        Draft lottery
      </PageTitle>
      <Flash sp={await searchParams} />

      <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide">1. Odds</h2>
      <Card className="p-4">
        <p className="mb-3 text-sm text-mute">
          Balls (or percentages) for each lottery seed; chances are proportional, so any numbers work. Seed 1 is the worst record.
          {up.entrants.length > 0 && ` Teams shown are ${up.complete ? "this year's lottery teams" : "projected from current standings"}.`}
        </p>
        <form action={saveLotteryOdds} className="space-y-2">
          {Array.from({ length: LOTTERY_SPOTS }, (_, i) => {
            const seed = i + 1;
            const e = up.entrants[i];
            return (
              <div key={seed} className="flex items-center gap-3">
                <label htmlFor={`seed${seed}`} className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold">Seed {seed}</span>
                  <span className="text-mute"> · {seed === 1 ? "worst record" : seed === 8 ? "best non-playoff record" : `${13 - seed}th place`}</span>
                  {e && <span className="block truncate text-xs text-mute">{e.ts.team_name} ({e.ts.wins}-{e.ts.losses}-{e.ts.ties})</span>}
                </label>
                <input id={`seed${seed}`} name={`seed${seed}`} inputMode="decimal" defaultValue={odds[i]?.balls ?? ""} className="field w-24 text-right" />
                <span className="w-16 text-right text-xs text-mute num">{first ? `${fmtChance(first[i])} #1` : ""}</span>
              </div>
            );
          })}
          <button className="btn mt-2">Save odds</button>
        </form>
      </Card>

      <h2 className="mb-2 mt-8 font-display text-lg font-bold uppercase tracking-wide">2. Run the {up.draftYear} lottery</h2>
      <Card className="p-4 text-sm">
        {alreadyRun ? (
          <p>
            The {up.draftYear} lottery has been run. <Link href={`/draft/${up.draftYear}`} className="text-red hover:underline">See the results →</Link>
          </p>
        ) : !up.complete ? (
          <p className="text-mute">Available once the {up.basedOn} season (including the playoffs) is finished.</p>
        ) : !up.oddsSet ? (
          <p className="text-mute">Save the odds for all 8 seeds first.</p>
        ) : (
          <form action={runLottery} className="space-y-3">
            <p>
              Draws picks 1–8 among: {up.entrants.map((e) => e.ts.team_name).join(", ")}.
              Picks 9–12: {playoff.map((t) => t.team_name).join(", ")}.
            </p>
            <p className="font-semibold text-red">
              This can only be done once. The result is published immediately and can&apos;t be re-drawn, so run it when the league is watching.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input name="confirm" placeholder={`Type ${up.draftYear}`} className="field w-32" />
              <button className="btn">Run the lottery</button>
            </div>
          </form>
        )}
      </Card>
    </>
  );
}
