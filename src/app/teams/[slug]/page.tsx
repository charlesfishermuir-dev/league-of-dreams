import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Card, FinishBadge, PageTitle, SectionTitle, td, th } from "@/components/ui";
import { fmtPct, fmtRecord, headToHead, loadHistory, ordinal, SHORT_SEASON, STAGE_LABEL, winPct } from "@/lib/history";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const h = await loadHistory();
  const f = h.franchises.find((x) => x.slug === slug);
  return { title: f?.name ?? "Team" };
}

export default async function TeamPage({ params }: Props) {
  const { slug } = await params;
  const h = await loadHistory();
  const f = h.franchises.find((x) => x.slug === slug);
  if (!f) notFound();

  const seasons = h.teamSeasons.filter((t) => t.franchise_id === f.id).sort((a, b) => b.year - a.year);
  const w = seasons.reduce((s, t) => s + t.wins, 0);
  const l = seasons.reduce((s, t) => s + t.losses, 0);
  const t = seasons.reduce((s, x) => s + x.ties, 0);
  const rings = seasons.filter((x) => x.finish === "champion").map((x) => x.year);
  const runnerUps = seasons.filter((x) => x.finish === "runner_up").map((x) => x.year);
  const playoffYears = seasons.filter((x) => x.finish).length;
  const best = [...seasons].sort((a, b) => winPct(b.wins, b.losses, b.ties) - winPct(a.wins, a.losses, a.ties))[0];

  // Name history, oldest first, collapsing consecutive years with the same name.
  const names: { name: string; from: number; to: number }[] = [];
  for (const s of [...seasons].reverse()) {
    const last = names.at(-1);
    if (last && last.name === s.team_name) last.to = s.year;
    else names.push({ name: s.team_name, from: s.year, to: s.year });
  }
  const managers = [...new Set([...seasons].reverse().map((s) => s.manager_label))];
  const current = managers.at(-1)!;

  const playoffGames = h.matchups
    .filter((m) => m.stage !== "regular" && (m.home_id === f.id || m.away_id === f.id))
    .sort((a, b) => b.year - a.year || (a.stage === "final" ? -1 : 1));
  const h2h = headToHead(h, current, ["semifinal", "final", "third_place"]);

  return (
    <>
      <PageTitle
        kicker={f.active ? `Since ${seasons.at(-1)!.year}` : `${seasons.at(-1)!.year}–${seasons[0].year}`}
        sub={<>Managed by <span className="text-chalk">{managers.join(", then ")}</span></>}
      >
        {f.name}
      </PageTitle>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="All-time" value={fmtRecord(w, l, t)} sub={fmtPct(winPct(w, l, t))} />
        <Stat label="Championships" value={String(rings.length)} sub={rings.join(", ") || "—"} gold={rings.length > 0} />
        <Stat label="Playoffs" value={`${playoffYears}`} sub={`of ${seasons.length} seasons`} />
        <Stat label="Best season" value={String(best.year)} sub={`${fmtRecord(best.wins, best.losses, best.ties)} · ${ordinal(best.place)}`} />
      </div>
      {runnerUps.length > 0 && <p className="mt-3 text-sm text-mute">Runner-up: {runnerUps.join(", ")}</p>}

      <Card className="mt-6 border-dashed p-4 text-center text-sm text-mute">
        Current roster arrives with the Fantrax sync in Stage 2.
      </Card>

      <SectionTitle kicker="Year by year">Season history</SectionTitle>
      <Card className="table-scroll">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b border-line">
            <tr>
              <th className={th}>Year</th>
              <th className={th}>Team</th>
              <th className={`${th} text-right`}>W-L-T</th>
              <th className={`${th} text-right`}>Pct</th>
              <th className={`${th} text-right`}>Place</th>
              <th className={th}>Playoffs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {seasons.map((s) => (
              <tr key={s.id} className="hover:bg-navy-800/60">
                <td className={`${td} font-display font-bold`}>
                  <Link href={`/history/${s.year}`} className="hover:text-red">
                    {s.year}{s.year === SHORT_SEASON && <span className="text-mute">*</span>}
                  </Link>
                </td>
                <td className={td}>
                  {s.team_name}
                  {managers.length > 1 && <span className="block text-xs text-mute">{s.manager_label}</span>}
                </td>
                <td className={`${td} num text-right`}>{fmtRecord(s.wins, s.losses, s.ties)}</td>
                <td className={`${td} num text-right font-semibold`}>{fmtPct(winPct(s.wins, s.losses, s.ties))}</td>
                <td className={`${td} num text-right`}>{ordinal(s.place)}</td>
                <td className={td}><FinishBadge finish={s.finish} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {names.length > 1 && (
        <>
          <SectionTitle kicker="Formerly known as">Name history</SectionTitle>
          <Card>
            <ul className="divide-y divide-line">
              {names.map((n) => (
                <li key={`${n.name}${n.from}`} className="flex justify-between gap-3 px-4 py-2 text-sm">
                  <span>{n.name}</span>
                  <span className="text-mute num">{n.from === n.to ? n.from : `${n.from}–${n.to}`}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {playoffGames.length > 0 && (
        <>
          <SectionTitle kicker="October">Playoff results</SectionTitle>
          <Card>
            <ul className="divide-y divide-line">
              {playoffGames.map((m) => {
                const isHome = m.home_id === f.id;
                const oppId = isHome ? m.away_id : m.home_id;
                const opp = h.teamSeason.get(`${m.year}:${oppId}`)!;
                const [cw, cl] = isHome ? [m.home_w, m.home_l] : [m.home_l, m.home_w];
                const won = m.winner_id === f.id;
                return (
                  <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="w-10 font-display font-bold num">{m.year}</span>
                    <span className="w-24 shrink-0 text-mute">{STAGE_LABEL[m.stage]}</span>
                    <span className="min-w-0 flex-1 truncate">vs {opp.team_name}</span>
                    <span className={`font-semibold num ${won ? "text-chalk" : "text-mute"}`}>
                      {won ? "W" : "L"} {cw}-{cl}{m.home_t ? `-${m.home_t}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}

      {h2h.length > 0 && (
        <>
          <SectionTitle kicker={current}>Playoff head-to-head</SectionTitle>
          <Card className="table-scroll">
            <table className="w-full text-sm">
              <thead className="border-b border-line">
                <tr>
                  <th className={th}>Opponent</th>
                  <th className={`${th} text-right`}>Meetings</th>
                  <th className={`${th} text-right`}>W-L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {h2h.map((r) => (
                  <tr key={r.opponent}>
                    <td className={td}>{r.opponent}</td>
                    <td className={`${td} num text-right`}>{r.meetings}</td>
                    <td className={`${td} num text-right font-semibold`}>{r.w}-{r.l}{r.t ? `-${r.t}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="mt-2 text-xs text-mute">Regular-season head-to-head (2018 on) arrives with the Fantrax import in Stage 2.</p>
        </>
      )}
    </>
  );
}

function Stat({ label, value, sub, gold }: { label: string; value: string; sub?: string; gold?: boolean }) {
  return (
    <Card className="p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">{label}</p>
      <p className={`font-display text-2xl font-bold num ${gold ? "text-gold" : ""}`}>{value}</p>
      {sub && <p className="truncate text-xs text-mute num">{sub}</p>}
    </Card>
  );
}
