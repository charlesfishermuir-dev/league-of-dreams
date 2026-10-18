import Link from "next/link";
import type { Metadata } from "next";
import { Card, PageTitle, SectionTitle, TeamLink, td, th } from "@/components/ui";
import { TeamLogo } from "@/components/live";
import { LotteryCountdown } from "@/components/lottery-countdown";
import { loadHistory } from "@/lib/history";
import { loadCurrentSeason } from "@/lib/live";
import { draftTeamName, fmtChance, LOTTERY_SPOTS, loadDrafts, loadLotterySchedule, pickProbabilities, playoffSlots, upcomingLottery } from "@/lib/draft";

export const metadata: Metadata = { title: "Draft Lottery" };
export const dynamic = "force-dynamic"; // the countdown and results must never be stale

export default async function DraftPage() {
  const [h, { drafts, lotteries, odds }, cur] = await Promise.all([loadHistory(), loadDrafts(), loadCurrentSeason()]);
  const up = upcomingLottery(h, odds);
  const done = lotteries.get(up.draftYear) ?? drafts.find((d) => d.year === up.draftYear);
  const schedule = done ? null : await loadLotterySchedule(up.draftYear);
  const probs = up.oddsSet ? pickProbabilities(up.entrants.map((e) => e.balls!)) : null;
  const totalBalls = up.entrants.reduce((s, e) => s + (e.balls ?? 0), 0);
  const playoff = playoffSlots(h, up.basedOn);
  const slug = (id: number) => h.franchiseById.get(id)!.slug;

  return (
    <>
      <PageTitle kicker="5-round keeper draft" sub="How the draft order is set, the odds, and every lottery since 2020.">
        Draft Lottery
      </PageTitle>

      {schedule && (
        <div className="mb-8">
          <LotteryCountdown year={up.draftYear} runAt={schedule.run_at} lastError={schedule.last_error} />
        </div>
      )}

      {/* The next draft */}
      {done ? (
        <Card className="relative mb-8 overflow-hidden p-5 pl-6">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-gold" aria-hidden />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">The lottery has been drawn</p>
          <p className="font-display text-3xl font-bold uppercase">{up.draftYear} draft order is set</p>
          <Link href={`/draft/${up.draftYear}`} className="btn mt-3">Watch the reveal →</Link>
        </Card>
      ) : (
        <>
          <SectionTitle kicker={up.complete ? `Based on the final ${up.basedOn} standings` : `Projected from the current ${up.basedOn} standings`}>
            {up.draftYear} lottery odds
          </SectionTitle>
          {!up.oddsSet ? (
            <Card className="p-5 text-mute">The commissioner hasn&apos;t posted the lottery odds yet. Check back soon.</Card>
          ) : (
            <>
              <Card className="table-scroll">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="border-b border-line">
                    <tr>
                      <th className={`${th} sticky left-0 bg-navy-900`}>Seed · Team</th>
                      <th className={`${th} text-right`}>Odds</th>
                      {Array.from({ length: LOTTERY_SPOTS }, (_, i) => (
                        <th key={i} className={`${th} text-right`}>#{i + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {up.entrants.map((e, i) => (
                      <tr key={e.ts.id}>
                        <td className={`${td} sticky left-0 bg-navy-900`}>
                          <div className="flex items-center gap-2">
                            <span className="w-4 text-right text-mute num">{e.seed}</span>
                            <TeamLogo url={cur.logo.get(e.ts.franchise_id)} name={e.ts.team_name} size={24} />
                            <span className="min-w-0">
                              <span className="block truncate"><TeamLink slug={slug(e.ts.franchise_id)}>{e.ts.team_name}</TeamLink></span>
                              <span className="block text-xs text-mute">{e.ts.wins}-{e.ts.losses}-{e.ts.ties}</span>
                            </span>
                          </div>
                        </td>
                        <td className={`${td} num text-right text-mute`}>{e.balls} / {totalBalls}</td>
                        {probs![i].map((p, k) => (
                          <td key={k} className={`${td} num text-right ${p >= 0.25 ? "font-bold text-chalk" : p >= 0.1 ? "" : "text-mute"}`}
                              style={{ background: `rgba(227, 25, 55, ${Math.min(p, 0.6) * 0.55})` }}>
                            {fmtChance(p)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <p className="mt-2 text-xs text-mute">
                Chance of each team landing each pick. Seed 1 = worst regular-season record.
                {!up.complete && " These are projections and will change until the regular season ends."}
              </p>
            </>
          )}
        </>
      )}

      <SectionTitle kicker="How it works">The rules</SectionTitle>
      <Card className="p-5 text-sm leading-relaxed">
        <ul className="list-disc space-y-1.5 pl-5">
          <li><span className="font-semibold">Picks 1–8:</span> the 8 teams that miss the playoffs go into the lottery. All 8 spots are drawn. Worse records get more balls (see the odds above).</li>
          <li>Each pick is drawn one at a time; once a team is drawn, its balls come out of the pool.</li>
          <li><span className="font-semibold">Picks 9–12:</span> the playoff teams, in order: the two semifinal losers (worse regular-season record picks first), then the runner-up, and the champion picks last.</li>
          <li>The order is the same every round of the 5-round draft. Traded picks move with the slot.</li>
          <li>The lottery is run on this site by the commissioner. It can only be run once; the random numbers used are saved and shown with the results.</li>
        </ul>
        {up.complete && playoff.length === 4 && !done && (
          <p className="mt-3 text-mute">
            {up.draftYear} picks 9–12: {playoff.map((t, i) => `${9 + i}. ${t.team_name}`).join(" · ")}
          </p>
        )}
      </Card>

      <SectionTitle kicker="Since 2020">Lottery history</SectionTitle>
      <div className="grid gap-3 md:grid-cols-2">
        {drafts.map((d) => {
          const top = d.order.filter((o) => o.how === "lottery").slice(0, 3);
          const biggest = d.order.filter((o) => o.how === "lottery" && o.seed).sort((a, b) => (b.seed! - b.slot) - (a.seed! - a.slot))[0];
          return (
            <Link key={d.year} href={`/draft/${d.year}`} className="group">
              <Card className="h-full p-4 transition group-hover:border-red">
                <div className="flex items-baseline justify-between">
                  <p className="font-display text-2xl font-bold">{d.year} draft</p>
                  <p className="text-xs text-mute">{d.source === "site" ? "Drawn on this site" : `From ${d.based_on} standings`}</p>
                </div>
                <ol className="mt-2 space-y-0.5 text-sm">
                  {top.map((o) => (
                    <li key={o.slot} className="flex gap-2">
                      <span className="w-6 font-display font-bold text-gold num">#{o.slot}</span>
                      <span className="min-w-0 flex-1 truncate">{draftTeamName(h, d, o.franchise_id)}</span>
                      <span className="text-xs text-mute">seed {o.seed}</span>
                    </li>
                  ))}
                </ol>
                {biggest && biggest.seed! - biggest.slot > 0 && (
                  <p className="mt-2 text-xs text-emerald-300">
                    Biggest jump: {draftTeamName(h, d, biggest.franchise_id)}, seed {biggest.seed} → pick {biggest.slot} (▲{biggest.seed! - biggest.slot})
                  </p>
                )}
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
