import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { Flash } from "@/components/admin";
import { requireAdmin } from "@/lib/supabase-server";
import { loadHistory } from "@/lib/history";
import { fmtChance, LOTTERY_SPOTS, pickProbabilities, playoffSlots, upcomingLottery } from "@/lib/draft";
import { cancelLotterySchedule, runLottery, saveLotteryOdds, scheduleLottery } from "../actions";

type Props = { searchParams: Promise<{ saved?: string; error?: string }> };

export default async function AdminLottery({ searchParams }: Props) {
  const { supabase } = await requireAdmin();
  const h = await loadHistory();
  const [{ data: oddsRows }, { data: existing }, { data: schedules }] = await Promise.all([
    supabase.from("lottery_odds").select("*").order("seed"),
    supabase.from("drafts").select("year"),
    supabase.from("lottery_schedule").select("*"),
  ]);
  const odds = (oddsRows ?? []).map((o) => ({ seed: o.seed as number, balls: o.balls === null ? null : Number(o.balls) }));
  const up = upcomingLottery(h, odds);
  const alreadyRun = (existing ?? []).some((d) => d.year === up.draftYear);
  const first = up.oddsSet ? pickProbabilities(up.entrants.map((e) => e.balls!)).map((p) => p[0]) : null;
  const playoff = playoffSlots(h, up.basedOn);
  const schedule = (schedules ?? []).find((x) => x.year === up.draftYear);
  const todayCentral = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }); // YYYY-MM-DD
  const fmtCentral = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

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

      <h2 className="mb-2 mt-8 font-display text-lg font-bold uppercase tracking-wide">2. Schedule it (runs itself)</h2>
      <Card className="p-4 text-sm">
        {alreadyRun ? (
          <p className="text-mute">Already drawn.</p>
        ) : (
          <>
            {schedule && (
              <div className="mb-3 rounded-md bg-navy-800 p-3">
                <p>
                  <span className="font-semibold">Scheduled:</span> {fmtCentral(schedule.run_at)} CT. A countdown is showing on the Draft page and Home.
                </p>
                {schedule.last_error && <p className="mt-1 text-red">Not run yet: {schedule.last_error} (it retries every minute)</p>}
                <form action={cancelLotterySchedule} className="mt-2">
                  <input type="hidden" name="year" value={up.draftYear} />
                  <button className="text-sm font-semibold text-mute hover:text-red">Cancel the scheduled time</button>
                </form>
              </div>
            )}
            <form action={scheduleLottery} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="year" value={up.draftYear} />
              <label className="text-xs text-mute">Date<input type="date" name="day" defaultValue={todayCentral} className="field mt-1 block" /></label>
              <label className="text-xs text-mute">Time (Central)<input type="time" name="time" defaultValue="12:00" className="field mt-1 block" /></label>
              <button className="btn">{schedule ? "Change time" : "Schedule"}</button>
            </form>
            <p className="mt-2 text-xs text-mute">At that minute the database draws the lottery on its own and everyone watching the countdown sees the reveal start.</p>
          </>
        )}
      </Card>

      <h2 className="mb-2 mt-8 font-display text-lg font-bold uppercase tracking-wide">3. Or run it right now</h2>
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
            <input type="hidden" name="year" value={up.draftYear} />
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
