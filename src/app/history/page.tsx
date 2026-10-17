import Link from "next/link";
import type { Metadata } from "next";
import { Card, PageTitle, SectionTitle, TeamLink, td, th } from "@/components/ui";
import { champions, fmtPct, fmtRecord, loadHistory, managerTotals, SHORT_SEASON } from "@/lib/history";

export const metadata: Metadata = { title: "League History" };
export const revalidate = 300;

export default async function HistoryPage() {
  const h = await loadHistory();
  const slug = (id: number) => h.franchiseById.get(id)!.slug;
  const years = champions(h).reverse();
  const managers = managerTotals(h).sort((a, b) => b.rings.length - a.rings.length || b.pct - a.pct);
  const trophyCase = managers.filter((m) => m.rings.length || m.runnerUps.length);

  return (
    <>
      <PageTitle kicker={`${h.seasons[0].year}–${h.seasons.at(-1)!.year}`} sub="Every champion, every ring, every manager.">
        League History
      </PageTitle>

      <SectionTitle kicker="Year by year">Champions</SectionTitle>
      <Card className="table-scroll">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b border-line">
            <tr>
              <th className={th}>Year</th>
              <th className={th}>Champion</th>
              <th className={th}>Runner-up</th>
              <th className={th}>Best regular season</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {years.map(({ season, champion, runnerUp, regularSeasonWinner: rs }) => (
              <tr key={season.year} className="hover:bg-navy-800/60">
                <td className={`${td} font-display text-lg font-bold`}>
                  <Link href={`/history/${season.year}`} className="text-gold hover:underline">
                    {season.year}
                    {season.year === SHORT_SEASON && <span className="text-mute">*</span>}
                  </Link>
                </td>
                <td className={td}>
                  {champion && (
                    <>
                      <TeamLink slug={slug(champion.franchise_id)}>{champion.team_name}</TeamLink>
                      <span className="block text-xs text-mute">{champion.manager_label}</span>
                    </>
                  )}
                </td>
                <td className={td}>
                  {runnerUp && (
                    <>
                      <TeamLink slug={slug(runnerUp.franchise_id)}>{runnerUp.team_name}</TeamLink>
                      <span className="block text-xs text-mute">{runnerUp.manager_label}</span>
                    </>
                  )}
                </td>
                <td className={td}>
                  {rs && (
                    <>
                      <TeamLink slug={slug(rs.franchise_id)}>{rs.team_name}</TeamLink>
                      <span className="block text-xs text-mute num">{fmtRecord(rs.wins, rs.losses, rs.ties)}</span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-2 text-xs text-mute">* {SHORT_SEASON}: COVID-shortened 60-game season.</p>

      <SectionTitle kicker="Hardware">Trophy case</SectionTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {trophyCase.map((m) => (
          <Card key={m.manager} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-bold uppercase">{m.manager}</p>
                <p className="truncate text-xs text-mute">{m.latestTeam}</p>
              </div>
              <p className="shrink-0 text-2xl leading-none" aria-label={`${m.rings.length} championships`}>
                {"🏆".repeat(m.rings.length)}
              </p>
            </div>
            <dl className="mt-3 space-y-1 text-sm">
              {m.rings.length > 0 && (
                <div className="flex gap-2"><dt className="w-24 shrink-0 text-mute">Rings</dt><dd className="num text-gold">{m.rings.join(", ")}</dd></div>
              )}
              {m.runnerUps.length > 0 && (
                <div className="flex gap-2"><dt className="w-24 shrink-0 text-mute">Runner-up</dt><dd className="num">{m.runnerUps.join(", ")}</dd></div>
              )}
              <div className="flex gap-2"><dt className="w-24 shrink-0 text-mute">Playoffs</dt><dd className="num">{m.playoffs.length} of {m.seasons} seasons</dd></div>
            </dl>
          </Card>
        ))}
      </div>

      <SectionTitle kicker="Since 2007">All-time standings</SectionTitle>
      <Card className="table-scroll">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line">
            <tr>
              <th className={th}>Manager</th>
              <th className={th}>Yrs</th>
              <th className={`${th} text-right`}>W-L-T</th>
              <th className={`${th} text-right`}>Pct</th>
              <th className={`${th} text-right`}>🏆</th>
              <th className={`${th} text-right`}>2nd</th>
              <th className={`${th} text-right`}>Playoffs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {[...managers].sort((a, b) => b.pct - a.pct).map((m) => (
              <tr key={m.manager} className={m.active ? "" : "text-mute"}>
                <td className={td}>
                  <TeamLink slug={m.franchiseSlugs.at(-1)!}>{m.manager}</TeamLink>
                  <span className="block text-xs text-mute">{m.first === m.last ? m.first : `${m.first}–${m.last}`}</span>
                </td>
                <td className={`${td} num`}>{m.seasons}</td>
                <td className={`${td} num text-right`}>{fmtRecord(m.w, m.l, m.t)}</td>
                <td className={`${td} num text-right font-semibold`}>{fmtPct(m.pct)}</td>
                <td className={`${td} num text-right text-gold`}>{m.rings.length || ""}</td>
                <td className={`${td} num text-right`}>{m.runnerUps.length || ""}</td>
                <td className={`${td} num text-right`}>{m.playoffs.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-2 text-xs text-mute">Greyed-out names are no longer in the league. Win % counts a tie as half a win.</p>
    </>
  );
}
