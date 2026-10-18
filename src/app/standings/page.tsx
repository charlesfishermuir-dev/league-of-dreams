import type { Metadata } from "next";
import { Card, FinishBadge, PageTitle, TeamLink, td, th } from "@/components/ui";
import { TeamLogo, UpdatedLine } from "@/components/live";
import { fmtPct, fmtRecord, winPct } from "@/lib/history";
import { loadCurrentSeason, standingsRows } from "@/lib/live";

export const metadata: Metadata = { title: "Standings" };
export const revalidate = 60;

const PLAYOFF_TEAMS = 4;

export default async function StandingsPage() {
  const { h, season, teams, matchups, logo, periods, currentPeriod, sync } = await loadCurrentSeason();
  const rows = standingsRows(teams, matchups);
  const weeksPlayed = new Set(matchups.filter((m) => m.stage === "regular" && m.status === "final").map((m) => m.period)).size;
  const regularWeeks = periods.filter((p) => !p.is_playoffs).length;
  const name = (id: number) => h.teamSeason.get(`${season.year}:${id}`)?.team_name ?? h.franchiseById.get(id)!.name;
  const period = periods.find((p) => p.period === currentPeriod);

  return (
    <>
      <PageTitle
        kicker={`${season.year} regular season`}
        sub={<>{weeksPlayed} of {regularWeeks} weeks played{period?.is_playoffs ? " · playoffs under way" : ""}. Records count every category won, lost and tied.</>}
      >
        Standings
      </PageTitle>
      <div className="mb-2"><UpdatedLine status={sync.get("matchups")} /></div>

      <Card className="table-scroll">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-line">
            <tr>
              <th className={`${th} sticky left-0 bg-navy-900`}>Team</th>
              <th className={`${th} text-right`}>W-L-T</th>
              <th className={`${th} text-right`}>Pct</th>
              <th className={`${th} text-right`}>GB</th>
              <th className={`${th} text-right`}>Strk</th>
              <th className={`${th} text-right`} title="Category points: wins plus half of ties">Pts For</th>
              <th className={`${th} text-right`}>Pts Agst</th>
              <th className={th}>Last week</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const f = h.franchiseById.get(r.ts.franchise_id)!;
              return (
                <tr
                  key={r.ts.id}
                  className={`hover:bg-navy-800/60 ${i === PLAYOFF_TEAMS - 1 ? "border-b-2 border-red" : "border-b border-line"}`}
                >
                  <td className={`${td} sticky left-0 bg-navy-900`}>
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-right text-mute num">{r.ts.place}</span>
                      <TeamLogo url={logo.get(f.id)} name={r.ts.team_name} size={28} />
                      <span className="min-w-0">
                        <span className="block truncate"><TeamLink slug={f.slug}>{r.ts.team_name}</TeamLink></span>
                        <span className="flex items-center gap-1.5 text-xs text-mute">
                          {r.ts.manager_label}
                          <FinishBadge finish={r.ts.finish} />
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className={`${td} num text-right`}>{fmtRecord(r.ts.wins, r.ts.losses, r.ts.ties)}</td>
                  <td className={`${td} num text-right font-semibold`}>{fmtPct(winPct(r.ts.wins, r.ts.losses, r.ts.ties))}</td>
                  <td className={`${td} num text-right text-mute`}>{r.gb === 0 ? "–" : r.gb}</td>
                  <td className={`${td} num text-right ${r.streak.startsWith("W") ? "text-emerald-300" : r.streak.startsWith("L") ? "text-red" : ""}`}>{r.streak}</td>
                  <td className={`${td} num text-right`}>{r.catFor}</td>
                  <td className={`${td} num text-right text-mute`}>{r.catAgainst}</td>
                  <td className={`${td} whitespace-nowrap text-xs`}>
                    {r.lastWeek && (
                      <>
                        <span className={r.lastWeek.result === "W" ? "font-bold text-emerald-300" : r.lastWeek.result === "L" ? "font-bold text-red" : "font-bold"}>
                          {r.lastWeek.result}
                        </span>{" "}
                        <span className="num">{r.lastWeek.score}</span>
                        <span className="text-mute"> vs {name(r.lastWeek.opponentId)}</span>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="mt-2 text-xs text-mute">
        Top {PLAYOFF_TEAMS} make the playoffs (red line). GB = games back, counting each category as a game. Pts = category wins plus half of ties.
      </p>
    </>
  );
}
