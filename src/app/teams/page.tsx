import Link from "next/link";
import type { Metadata } from "next";
import { Card, PageTitle, SectionTitle } from "@/components/ui";
import { fmtPct, fmtRecord, loadHistory, winPct, type History } from "@/lib/history";

export const metadata: Metadata = { title: "Teams" };
export const revalidate = 300;

function franchiseSummary(h: History, franchiseId: number) {
  const seasons = h.teamSeasons.filter((t) => t.franchise_id === franchiseId).sort((a, b) => a.year - b.year);
  const w = seasons.reduce((s, t) => s + t.wins, 0);
  const l = seasons.reduce((s, t) => s + t.losses, 0);
  const t = seasons.reduce((s, x) => s + x.ties, 0);
  return {
    latest: seasons.at(-1),
    first: seasons[0]?.year,
    count: seasons.length,
    record: fmtRecord(w, l, t),
    pct: winPct(w, l, t),
    rings: seasons.filter((x) => x.finish === "champion").length,
  };
}

export default async function TeamsPage() {
  const h = await loadHistory();
  const active = h.franchises.filter((f) => f.active);
  const former = h.franchises.filter((f) => !f.active);

  return (
    <>
      <PageTitle kicker="The league" sub="Twelve franchises. Tap a team for its full history.">Teams</PageTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {active
          .map((f) => ({ f, s: franchiseSummary(h, f.id) }))
          .sort((a, b) => b.s.rings - a.s.rings || b.s.pct - a.s.pct)
          .map(({ f, s }) => (
            <Link key={f.id} href={`/teams/${f.slug}`} className="group">
              <Card className="relative h-full overflow-hidden p-4 transition group-hover:border-red">
                <div className="absolute inset-y-0 left-0 w-1 bg-red opacity-0 transition group-hover:opacity-100" aria-hidden />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-display text-xl font-bold uppercase">{f.name}</p>
                    <p className="truncate text-sm text-mute">{s.latest?.manager_label}</p>
                  </div>
                  {s.rings > 0 && <p className="shrink-0 text-lg leading-none">{"🏆".repeat(s.rings)}</p>}
                </div>
                <div className="mt-3 flex gap-4 text-sm">
                  <span><span className="text-mute">Since </span><span className="num">{s.first}</span></span>
                  <span className="num">{s.record}</span>
                  <span className="num font-semibold">{fmtPct(s.pct)}</span>
                </div>
              </Card>
            </Link>
          ))}
      </div>

      <SectionTitle kicker="Gone but not forgotten">Former franchises</SectionTitle>
      <Card>
        <ul className="divide-y divide-line">
          {former.map((f) => {
            const s = franchiseSummary(h, f.id);
            return (
              <li key={f.id}>
                <Link href={`/teams/${f.slug}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-navy-800/60">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{f.name}</span>
                    <span className="text-sm text-mute"> · {s.latest?.manager_label}</span>
                  </span>
                  <span className="text-sm text-mute num">
                    {s.first === s.latest?.year ? s.first : `${s.first}–${s.latest?.year}`}
                  </span>
                  {s.rings > 0 && <span>{"🏆".repeat(s.rings)}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
