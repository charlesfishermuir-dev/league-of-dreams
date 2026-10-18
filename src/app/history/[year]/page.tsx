import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Card, FinishBadge, How2020Counts, PageTitle, SectionTitle, TeamLink, td, th } from "@/components/ui";
import {
  fmtPct, fmtRecord, fmtStat, loadHistory, SHORT_SEASON, STAGE_LABEL, winPct,
  type History, type Matchup,
} from "@/lib/history";

export const revalidate = 300;

type Props = { params: Promise<{ year: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `${(await params).year} Season` };
}

export default async function SeasonPage({ params }: Props) {
  const year = Number((await params).year);
  const h = await loadHistory();
  const season = h.seasons.find((s) => s.year === year);
  if (!season) notFound();

  const teams = h.teamSeasons.filter((t) => t.year === year).sort((a, b) => a.place - b.place);
  const slug = (id: number) => h.franchiseById.get(id)!.slug;
  const playoffs = h.matchups.filter((m) => m.year === year && m.stage !== "regular");
  const years = h.seasons.map((s) => s.year);
  const prev = years[years.indexOf(year) - 1];
  const next = years[years.indexOf(year) + 1];
  const champ = teams.find((t) => t.finish === "champion");

  return (
    <>
      <div className="mb-4 flex justify-between text-sm font-semibold">
        {prev ? <Link href={`/history/${prev}`} className="text-mute hover:text-chalk">← {prev}</Link> : <span />}
        {next ? <Link href={`/history/${next}`} className="text-mute hover:text-chalk">{next} →</Link> : <span />}
      </div>

      <PageTitle kicker={season.league_name ?? undefined} sub={season.notes}>
        {year} Season
      </PageTitle>

      {year === SHORT_SEASON && (
        <div className="mb-8">
          <How2020Counts />
        </div>
      )}

      {champ && (
        <Card className="relative mb-8 overflow-hidden p-5 pl-6">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-gold" aria-hidden />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Champion</p>
          <p className="font-display text-3xl font-bold uppercase">
            🏆 <TeamLink slug={slug(champ.franchise_id)}>{champ.team_name}</TeamLink>
          </p>
          <p className="text-sm text-mute">{champ.manager_label}</p>
        </Card>
      )}

      {playoffs.length > 0 && (
        <>
          <SectionTitle kicker="Bracket">Playoffs</SectionTitle>
          <div className="grid gap-3 md:grid-cols-3">
            {(["semifinal", "final"] as const).map((stage) => (
              <div key={stage} className={stage === "final" ? "md:order-last" : "md:col-span-2 grid gap-3 sm:grid-cols-2"}>
                {playoffs
                  .filter((m) => m.stage === stage)
                  .map((m) => <PlayoffCard key={m.id} m={m} h={h} />)}
              </div>
            ))}
          </div>
        </>
      )}

      <SectionTitle kicker="Regular season">Final standings</SectionTitle>
      <Card className="table-scroll">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="border-b border-line">
            <tr>
              <th className={`${th} sticky left-0 bg-navy-900`}>#&nbsp;Team</th>
              <th className={`${th} text-right`}>W-L-T</th>
              <th className={`${th} text-right`}>Pct</th>
              <th className={th}>Playoffs</th>
              {season.categories.map((c) => (
                <th key={c} className={`${th} text-right`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {teams.map((t) => (
              <tr key={t.id} className="hover:bg-navy-800/60">
                <td className={`${td} sticky left-0 bg-navy-900`}>
                  <span className="mr-2 inline-block w-5 text-right text-mute num">{t.place}</span>
                  <TeamLink slug={slug(t.franchise_id)}>{t.team_name}</TeamLink>
                  <span className="ml-7 block text-xs text-mute">{t.manager_label}</span>
                </td>
                <td className={`${td} num text-right`}>{fmtRecord(t.wins, t.losses, t.ties)}</td>
                <td className={`${td} num text-right font-semibold`}>{fmtPct(winPct(t.wins, t.losses, t.ties))}</td>
                <td className={td}><FinishBadge finish={t.finish} /></td>
                {season.categories.map((c) => (
                  <td key={c} className={`${td} num text-right ${leaderClass(teams, t, c)}`}>{fmtStat(c, t.stats[c])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-2 text-xs text-mute">Category totals for the full regular season. Highlighted numbers led the league.</p>
    </>
  );
}

function leaderClass(teams: History["teamSeasons"], t: History["teamSeasons"][number], cat: string) {
  const values = teams.map((x) => x.stats[cat]).filter((v) => v !== undefined);
  if (!values.length || t.stats[cat] === undefined) return "";
  const best = ["ERA", "WHIP", "L"].includes(cat) ? Math.min(...values) : Math.max(...values);
  return t.stats[cat] === best ? "font-bold text-gold" : "";
}

function PlayoffCard({ m, h }: { m: Matchup; h: History }) {
  const home = h.teamSeason.get(`${m.year}:${m.home_id}`)!;
  const away = h.teamSeason.get(`${m.year}:${m.away_id}`)!;
  const homeWon = m.winner_id === m.home_id;
  const rows = [
    { ts: home, seed: m.home_seed, w: m.home_w, l: m.home_l, won: homeWon },
    { ts: away, seed: m.away_seed, w: m.home_l, l: m.home_w, won: !homeWon },
  ];
  return (
    <Card className={m.stage === "final" ? "border-gold/60" : ""}>
      <p className={`border-b border-line px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wider ${m.stage === "final" ? "text-gold" : "text-mute"}`}>
        {STAGE_LABEL[m.stage]}
      </p>
      {rows.map((r) => (
        <div key={r.ts.id} className={`flex items-center gap-2 px-3 py-2 ${r.won ? "" : "text-mute"}`}>
          <span className="w-4 text-xs text-mute num">{r.seed}</span>
          <span className="min-w-0 flex-1 truncate font-medium">{r.ts.team_name}</span>
          <span className={`font-display text-xl font-bold num ${r.won ? "text-chalk" : ""}`}>{r.w}</span>
        </div>
      ))}
      {m.home_t > 0 && <p className="px-3 pb-2 text-xs text-mute">{m.home_t} tied {m.home_t === 1 ? "category" : "categories"}</p>}
    </Card>
  );
}
