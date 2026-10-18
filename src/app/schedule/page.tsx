import Link from "next/link";
import type { Metadata } from "next";
import { Card, PageTitle } from "@/components/ui";
import { MatchupCard, UpdatedLine } from "@/components/live";
import { fmtDateRange, loadCurrentSeason } from "@/lib/live";

export const metadata: Metadata = { title: "Schedule & Results" };
export const revalidate = 60;

type Props = { searchParams: Promise<{ week?: string }> };

export default async function SchedulePage({ searchParams }: Props) {
  const { h, season, periods, matchups, currentPeriod, logo, sync } = await loadCurrentSeason();
  const requested = Number((await searchParams).week);
  const week = periods.some((p) => p.period === requested) ? requested : currentPeriod;
  const period = periods.find((p) => p.period === week);
  const games = matchups.filter((m) => m.period === week);
  const idx = periods.findIndex((p) => p.period === week);
  const prev = periods[idx - 1];
  const next = periods[idx + 1];

  return (
    <>
      <PageTitle kicker={`${season.year} season`} sub="Every week's matchups. Tap a game for the category breakdown.">
        Schedule &amp; Results
      </PageTitle>

      {/* Week strip: scrolls sideways on phones */}
      <nav className="table-scroll -mx-4 mb-4 px-4" aria-label="Weeks">
        <ul className="flex gap-1.5 whitespace-nowrap pb-2">
          {periods.map((p) => (
            <li key={p.period}>
              <Link
                href={`/schedule?week=${p.period}`}
                scroll={false}
                className={`block rounded-full px-3 py-1 text-sm font-semibold ${
                  p.period === week ? "bg-red text-white" : p.is_playoffs ? "bg-gold/15 text-gold hover:bg-gold/25" : "bg-navy-800 text-mute hover:text-chalk"
                }`}
              >
                {p.is_playoffs ? (p.label === "Championship" ? "🏆 Final" : "Playoffs") : p.period}
                {p.period === currentPeriod && p.period !== week ? " •" : ""}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mb-3 flex items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-3xl font-bold uppercase leading-none">{period?.label}</h2>
          <p className="text-sm text-mute">{fmtDateRange(period)}</p>
        </div>
        <div className="flex gap-3 text-sm font-semibold">
          {prev && <Link href={`/schedule?week=${prev.period}`} scroll={false} className="text-mute hover:text-chalk">← Prev</Link>}
          {next && <Link href={`/schedule?week=${next.period}`} scroll={false} className="text-mute hover:text-chalk">Next →</Link>}
        </div>
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
      <div className="mt-3"><UpdatedLine status={sync.get("matchups")} /></div>
      <p className="mt-6 text-sm text-mute">
        Looking for an older season? Every year&apos;s standings and playoffs are in{" "}
        <Link href="/history" className="text-red hover:underline">League History</Link>.
      </p>
    </>
  );
}
