import Link from "next/link";
import { Card, SectionTitle, TeamLink } from "@/components/ui";
import { MatchupCard, TeamLogo, UpdatedLine } from "@/components/live";
import { champions, fmtRecord, managerTotals } from "@/lib/history";
import { fmtDateRange, fmtDay, loadCurrentSeason, loadRecentTransactions } from "@/lib/live";
import { excerpt, fmtNewsDate, loadNews, NEWS_KINDS } from "@/lib/news";
import { LotteryCountdown } from "@/components/lottery-countdown";
import { Trophy, type Celebrant } from "@/components/trophy";
import { loadLotterySchedule } from "@/lib/draft";

export const revalidate = 60;

// Celebrating beside the trophy: the 2026 champion Birmingham Vulcans' stars.
const CELEBRANTS: Celebrant[] = [
  { name: "Soto", number: 22, dance: "shuffle" },
  { name: "Rodríguez", number: 44, dance: "jump" },
];

export default async function Home() {
  const cur = await loadCurrentSeason();
  const { h, season, periods, currentPeriod, logo } = cur;
  const period = periods.find((p) => p.period === currentPeriod);
  const games = cur.matchups.filter((m) => m.period === currentPeriod);
  const isLive = games.some((m) => m.status === "live");
  const seasonOver = !isLive && currentPeriod === periods.at(-1)?.period && games.every((m) => m.status === "final");
  const [txGroups, news, lottery] = await Promise.all([
    loadRecentTransactions(40).then((g) => g.slice(0, 8)),
    loadNews(3),
    loadLotterySchedule(season.year + 1),
  ]);
  const lotterySoon = lottery?.status === "scheduled" && new Date(lottery.run_at).getTime() - Date.now() < 7 * 86_400_000;

  const champs = champions(h).filter((c) => c.champion);
  const latest = champs.at(-1)!;
  const slug = (id: number) => h.franchiseById.get(id)!.slug;
  const ringLeaders = managerTotals(h)
    .filter((m) => m.rings.length)
    .sort((a, b) => b.rings.length - a.rings.length || b.pct - a.pct)
    .slice(0, 5);

  return (
    <>
      {/* Hero */}
      <section className="relative -mx-4 -mt-6 mb-6 overflow-hidden border-b border-line bg-gradient-to-br from-navy-700 via-navy-900 to-ink px-4 pb-6 pt-8 sm:rounded-b-xl">
        <div className="absolute -right-10 top-0 h-full w-32 skew-x-[-18deg] bg-red/90 sm:w-64" aria-hidden />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red sm:text-white">{season.league_name ?? "League of Dreams"} · {season.year}</p>
          <h1 className="mt-2 font-display text-5xl font-bold uppercase leading-[0.9] tracking-wide sm:text-7xl">
            League
            <br />
            of Dreams
          </h1>
        </div>
      </section>

      {lotterySoon && (
        <Link href="/draft" className="mb-8 block">
          <LotteryCountdown year={season.year + 1} runAt={lottery!.run_at} lastError={lottery!.last_error} compact />
        </Link>
      )}

      {/* Scoreboard */}
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div className="flex items-end gap-3">
            <span className="h-7 w-1.5 shrink-0 bg-red" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red">
                {seasonOver ? `${season.year} · Final` : isLive ? "Live now" : "Scoreboard"} · {fmtDateRange(period)}
              </p>
              <h2 className="font-display text-2xl font-bold uppercase leading-none tracking-wide">{period?.label ?? "Scoreboard"}</h2>
            </div>
          </div>
          <UpdatedLine status={cur.sync.get("matchups")} live={isLive} />
        </div>
        {games.length === 0 ? (
          <Card className="p-5 text-center text-mute">No matchups this week.</Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((m) => (
              <MatchupCard key={m.id} m={m} h={h} logo={logo} categories={season.categories} />
            ))}
          </div>
        )}
        <div className="mt-2 flex gap-4 text-sm font-semibold">
          <Link href="/standings" className="text-red hover:underline">Standings →</Link>
          <Link href={`/schedule?week=${currentPeriod}`} className="text-red hover:underline">Full schedule →</Link>
        </div>
      </section>

      {/* The trophy */}
      <section className="relative my-8 overflow-hidden rounded-xl border border-line bg-[radial-gradient(ellipse_at_50%_35%,#24356f_0%,#0d1638_55%,#070c1f_100%)]">
        <div className="grid items-center md:grid-cols-[1.6fr_1fr]">
          <div className="h-[440px] sm:h-[540px]">
            <Trophy champions={champs.map((c) => ({ year: c.season.year, team: c.champion!.team_name }))} celebrants={CELEBRANTS} />
          </div>
          <div className="border-t border-line/60 p-5 md:border-l md:border-t-0 md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">The League of Dreams Trophy</p>
            <p className="mt-1 text-sm text-mute">
              Every champion since {champs[0].season.year}, engraved on the barrel. Drag to spin it.
              Celebrating with it: Vulcans stars Juan Soto and Julio Rodríguez.
            </p>
            <div className="mt-6 flex items-center gap-4">
              <TeamLogo url={logo.get(latest.champion!.franchise_id)} name={latest.champion!.team_name} size={56} />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">{latest.season.year} Champion</p>
                <p className="font-display text-3xl font-bold uppercase leading-tight">
                  <TeamLink slug={slug(latest.champion!.franchise_id)}>{latest.champion!.team_name}</TeamLink>
                </p>
                <p className="text-sm text-mute">
                  {latest.champion!.manager_label} · {fmtRecord(latest.champion!.wins, latest.champion!.losses, latest.champion!.ties)} regular season
                </p>
              </div>
            </div>
            <Link href="/history" className="mt-6 inline-block text-sm font-semibold text-red hover:underline">All champions →</Link>
          </div>
        </div>
      </section>

      {news.length > 0 && (
        <section className="mb-8">
          <SectionTitle kicker="From the commissioner">Latest news</SectionTitle>
          <div className="grid gap-3 md:grid-cols-3">
            {news.map((p) => (
              <Link key={p.id} href={`/news/${p.slug}`} className="group">
                <Card className="h-full p-4 transition group-hover:border-red">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-red">
                    {NEWS_KINDS[p.kind]} · <span className="text-mute">{fmtNewsDate(p.published_at)}</span>
                  </p>
                  <p className="mt-1 font-display text-xl font-bold uppercase leading-tight">{p.title}</p>
                  {excerpt(p.body, 120) && <p className="mt-1 text-sm text-mute">{excerpt(p.body, 120)}</p>}
                </Card>
              </Link>
            ))}
          </div>
          <Link href="/news" className="mt-2 inline-block text-sm font-semibold text-red hover:underline">All news →</Link>
        </section>
      )}

      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <SectionTitle kicker="Wire">Recent transactions</SectionTitle>
          <Card>
            <ul className="divide-y divide-line">
              {txGroups.map((g) => {
                const first = g[0];
                const isTrade = g.some((t) => t.type === "trade");
                const team = (id: number | null) => (id ? h.franchiseById.get(id)?.name : undefined);
                return (
                  <li key={first.fantrax_set_id} className="px-4 py-2.5 text-sm">
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs text-mute">
                      <span className="font-semibold uppercase tracking-wider">
                        {isTrade ? "Trade" : team(first.franchise_id)}
                      </span>
                      <span>{fmtDay(first.occurred_at)}</span>
                    </div>
                    <ul className="space-y-0.5">
                      {g.map((t) => (
                        <li key={t.id} className="flex gap-2">
                          <TxBadge type={t.type} />
                          <span className="min-w-0 truncate">
                            {t.player_name}
                            <span className="text-mute">
                              {t.player_positions ? ` ${t.player_positions}` : ""}
                              {isTrade && t.type === "trade" ? ` → ${team(t.franchise_id)}` : ""}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </Card>
          <div className="mt-1"><UpdatedLine status={cur.sync.get("transactions")} /></div>
        </section>

        <section>
          <SectionTitle kicker="Banner wall">Recent champions</SectionTitle>
          <Card>
            <ul className="divide-y divide-line">
              {champs.slice(-6).reverse().map((c) => (
                <li key={c.season.year} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-12 font-display text-lg font-bold text-gold num">{c.season.year}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <TeamLink slug={slug(c.champion!.franchise_id)}>{c.champion!.team_name}</TeamLink>
                  </span>
                  <span className="text-sm text-mute">{c.champion!.manager_label}</span>
                </li>
              ))}
            </ul>
          </Card>

          <SectionTitle kicker="Trophy case">Most rings</SectionTitle>
          <Card>
            <ul className="divide-y divide-line">
              {ringLeaders.map((m) => (
                <li key={m.manager} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{m.manager}</span>
                    <span className="block truncate text-xs text-mute">{m.rings.join(" · ")}</span>
                  </span>
                  <span className="font-display text-2xl font-bold text-gold num">{m.rings.length}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Link href="/history" className="mt-2 inline-block text-sm font-semibold text-red hover:underline">
            League history →
          </Link>
        </section>
      </div>
    </>
  );
}

function TxBadge({ type }: { type: string }) {
  const style: Record<string, string> = {
    claim: "bg-emerald-500/20 text-emerald-300",
    drop: "bg-red/20 text-red",
    trade: "bg-gold/20 text-gold",
  };
  const label: Record<string, string> = { claim: "Add", drop: "Drop", trade: "Trade" };
  return (
    <span className={`mt-0.5 h-fit shrink-0 rounded px-1.5 text-[10px] font-bold uppercase leading-4 tracking-wider ${style[type] ?? "bg-navy-700 text-mute"}`}>
      {label[type] ?? type}
    </span>
  );
}
