import Image from "next/image";
import Link from "next/link";
import { Card, SectionTitle, TeamLink } from "@/components/ui";
import { champions, fmtRecord, loadHistory, managerTotals } from "@/lib/history";

export const revalidate = 300;

export default async function Home() {
  const h = await loadHistory();
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
      <section className="relative -mx-4 -mt-6 mb-8 overflow-hidden border-b border-line bg-gradient-to-br from-navy-700 via-navy-900 to-ink px-4 pb-8 pt-10 sm:rounded-b-xl">
        <div className="absolute -right-10 top-0 h-full w-40 skew-x-[-18deg] bg-red/90 sm:w-64" aria-hidden />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red sm:text-white">Est. 2007 · {h.seasons.length} seasons</p>
          <h1 className="mt-2 font-display text-5xl font-bold uppercase leading-[0.9] tracking-wide sm:text-7xl">
            League
            <br />
            of Dreams
          </h1>
          <p className="mt-4 max-w-md text-mute">Twelve managers. Twelve categories. One ring.</p>
        </div>
      </section>

      {/* Reigning champion */}
      <Card className="relative mb-8 overflow-hidden">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-gold" aria-hidden />
        <div className="flex flex-wrap items-center justify-between gap-4 p-5 pl-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">{latest.season.year} Champion</p>
            <p className="font-display text-3xl font-bold uppercase leading-tight">
              <TeamLink slug={slug(latest.champion!.franchise_id)}>{latest.champion!.team_name}</TeamLink>
            </p>
            <p className="text-sm text-mute">
              {latest.champion!.manager_label} · {fmtRecord(latest.champion!.wins, latest.champion!.losses, latest.champion!.ties)} regular season
            </p>
          </div>
          <span className="text-5xl" aria-hidden>🏆</span>
        </div>
      </Card>

      <Card className="mb-8 border-dashed p-5 text-center text-mute">
        <p className="font-display text-lg uppercase tracking-wide text-chalk">Live scoreboard</p>
        <p className="text-sm">This week&apos;s matchups, news and transactions arrive in Stage 2.</p>
      </Card>

      <div className="grid gap-8 md:grid-cols-2">
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
          <Link href="/history" className="mt-2 inline-block text-sm font-semibold text-red hover:underline">
            Every champion since 2007 →
          </Link>
        </section>

        <section>
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
          <Link href="/records" className="mt-2 inline-block text-sm font-semibold text-red hover:underline">
            All-time records →
          </Link>
        </section>
      </div>

      <div className="mt-10 flex justify-center opacity-80">
        <Image src="/league-logo.jpg" alt="League of Dreams logo" width={240} height={135} className="rounded-lg" />
      </div>
    </>
  );
}

