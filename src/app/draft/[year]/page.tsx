import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Card, PageTitle, SectionTitle, TeamLink, td, th } from "@/components/ui";
import { LotteryReveal, type RevealPick } from "@/components/lottery-reveal";
import { loadHistory } from "@/lib/history";
import { loadCurrentSeason } from "@/lib/live";
import { draftTeamName, fmtChance, loadDraftPicks, loadDrafts, pickProbabilities, ROUNDS } from "@/lib/draft";

export const revalidate = 60;

type Props = { params: Promise<{ year: string }>; searchParams: Promise<{ reveal?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `${(await params).year} Draft` };
}

export default async function DraftYearPage({ params, searchParams }: Props) {
  const year = Number((await params).year);
  const [h, { drafts, lotteries }, cur, picks] = await Promise.all([loadHistory(), loadDrafts(), loadCurrentSeason(), loadDraftPicks(year)]);
  const draft = drafts.find((d) => d.year === year);
  if (!draft) notFound();
  const lottery = lotteries.get(year);
  const name = (id: number | null) => (id ? draftTeamName(h, draft, id) : "—");
  const slug = (id: number) => h.franchiseById.get(id)!.slug;
  const manager = (id: number) => h.teamSeason.get(`${draft.based_on}:${id}`)?.manager_label ?? "";
  const years = drafts.map((d) => d.year).sort();
  const prev = years[years.indexOf(year) - 1];
  const next = years[years.indexOf(year) + 1];

  let reveal: RevealPick[] | null = null;
  if (lottery) {
    const probs = pickProbabilities(lottery.entrants.map((e) => Number(e.balls)));
    reveal = lottery.draws.map((d) => {
      const i = lottery.entrants.findIndex((e) => e.franchise_id === d.franchise_id);
      return {
        pick: d.pick, teamName: name(d.franchise_id), manager: manager(d.franchise_id),
        logo: cur.logo.get(d.franchise_id) ?? null, seed: lottery.entrants[i].seed, chance: fmtChance(probs[i][d.pick - 1]),
      };
    });
  }

  return (
    <>
      <div className="mb-4 flex justify-between text-sm font-semibold">
        {prev ? <Link href={`/draft/${prev}`} className="text-mute hover:text-chalk">← {prev}</Link> : <Link href="/draft" className="text-mute hover:text-chalk">← Draft Lottery</Link>}
        {next && <Link href={`/draft/${next}`} className="text-mute hover:text-chalk">{next} →</Link>}
      </div>
      <PageTitle kicker={`Order from the ${draft.based_on} season`} sub="5-round keeper draft. The order is the same every round; traded picks are marked.">
        {year} Draft
      </PageTitle>

      {reveal && (
        <>
          <SectionTitle kicker={`Drawn ${new Date(lottery!.run_at).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "long", day: "numeric", year: "numeric" })}`}>
            Lottery reveal
          </SectionTitle>
          <LotteryReveal picks={reveal} autoStart={(await searchParams).reveal === "1"} />
        </>
      )}

      {/* With a reveal, picks 1-8 appear in the reveal itself, so they aren't spoiled here. */}
      <SectionTitle kicker={reveal ? "Picks 9–12" : "Picks 1–12"}>{reveal ? "Playoff teams" : "Draft order"}</SectionTitle>
      <Card>
        <ol className="divide-y divide-line text-sm">
          {draft.order.filter((o) => !reveal || o.how !== "lottery").map((o) => {
            const moved = o.seed ? o.seed - o.slot : 0;
            return (
              <li key={o.slot} className="flex items-center gap-3 px-4 py-2">
                <span className={`w-8 font-display text-lg font-bold num ${o.slot === 1 ? "text-gold" : ""}`}>{o.slot}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate"><TeamLink slug={slug(o.franchise_id)}>{name(o.franchise_id)}</TeamLink></span>
                  <span className="block text-xs text-mute">
                    {o.how === "lottery" ? `Lottery · seed ${o.seed}` : ["", "Semifinal loser", "Semifinal loser", "Runner-up", "Champion"][o.slot - 8]}
                  </span>
                </span>
                {moved !== 0 && (
                  <span className={`rounded px-1.5 font-display text-xs font-bold ${moved > 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-red/20 text-red"}`}>
                    {moved > 0 ? `▲${moved}` : `▼${-moved}`}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </Card>

      {picks.length > 0 && (
        <>
          <SectionTitle kicker="Every pick">Draft board</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: ROUNDS }, (_, r) => (
              <Card key={r}>
                <p className="border-b border-line px-4 py-2 font-display text-sm font-bold uppercase tracking-wider text-mute">Round {r + 1}</p>
                <ol className="divide-y divide-line/60 text-sm">
                  {picks.filter((p) => p.round === r + 1).map((p) => {
                    const traded = p.franchise_id && p.origin_franchise_id && p.franchise_id !== p.origin_franchise_id;
                    return (
                      <li key={p.pick} className="flex items-baseline gap-2 px-4 py-1.5">
                        <span className="w-6 shrink-0 text-right text-xs text-mute num">{p.pick}</span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate ${p.player ? "font-medium" : "italic text-mute"}`}>{p.player ?? "Forfeited"}</span>
                          <span className="block truncate text-xs text-mute">
                            {name(p.franchise_id)}
                            {traded && <span className="text-gold"> · via {name(p.origin_franchise_id)}</span>}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </Card>
            ))}
          </div>
        </>
      )}

      {lottery && (
        <>
          <SectionTitle kicker="For the record">How it was drawn</SectionTitle>
          <Card className="table-scroll">
            <table className="w-full text-sm">
              <thead className="border-b border-line">
                <tr>
                  <th className={th}>Pick</th>
                  <th className={th}>Team drawn</th>
                  <th className={`${th} text-right`}>Random number</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {lottery.draws.map((d) => (
                  <tr key={d.pick}>
                    <td className={`${td} font-display font-bold num`}>#{d.pick}</td>
                    <td className={td}>{name(d.franchise_id)}</td>
                    <td className={`${td} num text-right text-mute`}>{d.roll.toLocaleString()} of {d.out_of.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="mt-2 text-xs text-mute">
            For each pick, a random number was drawn from 0 up to the remaining teams&apos; total balls (×1,000). Teams fill that range in seed order,
            each taking a share the size of its balls, and the team whose share contains the number gets the pick. Odds used:{" "}
            {lottery.entrants.map((e) => `seed ${e.seed} ${e.balls}`).join(", ")}.
          </p>
        </>
      )}
    </>
  );
}
