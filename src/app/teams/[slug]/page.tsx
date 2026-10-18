import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
/* eslint-disable @next/next/no-img-element -- player headshots come from Fantrax */
import { Card, FinishBadge, Note2020, PageTitle, SectionTitle, td, th } from "@/components/ui";
import { TeamLogo, UpdatedLine } from "@/components/live";
import { allTimeRecord, fmtPct, fmtRecord, headToHead, inSeasonRecords, loadHistory, ordinal, SHORT_SEASON, STAGE_LABEL, winPct } from "@/lib/history";
import { loadCurrentSeason, loadRoster, type RosterPlayer } from "@/lib/live";

export const revalidate = 60;

const ROSTER_GROUPS: { status: RosterPlayer["status"]; label: string }[] = [
  { status: "active", label: "Starting lineup" },
  { status: "reserve", label: "Bench" },
  { status: "injured", label: "Injured list" },
  { status: "minors", label: "Minors" },
  { status: "other", label: "Other" },
];

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
  const allTime = allTimeRecord(seasons);
  const played2020 = seasons.some((s) => s.year === SHORT_SEASON);
  const rings = seasons.filter((x) => x.finish === "champion").map((x) => x.year);
  const runnerUps = seasons.filter((x) => x.finish === "runner_up").map((x) => x.year);
  const playoffYears = seasons.filter((x) => x.finish).length;
  const comparable = seasons.filter(inSeasonRecords);
  const best = [...(comparable.length ? comparable : seasons)].sort((a, b) => winPct(b.wins, b.losses, b.ties) - winPct(a.wins, a.losses, a.ties))[0];

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
  const h2h = headToHead(h, current);
  const cur = await loadCurrentSeason();
  const roster = f.active ? await loadRoster(cur.year, f.id) : [];

  return (
    <>
      <div className="flex items-start gap-4">
        {cur.logo.get(f.id) && <TeamLogo url={cur.logo.get(f.id)} name={f.name} size={72} />}
        <PageTitle
          kicker={f.active ? `Since ${seasons.at(-1)!.year}` : `${seasons.at(-1)!.year}–${seasons[0].year}`}
          sub={<>Managed by <span className="text-chalk">{managers.join(", then ")}</span></>}
        >
          {f.name}
        </PageTitle>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={played2020 ? "All-time*" : "All-time"} value={fmtRecord(allTime.w, allTime.l, allTime.t)} sub={fmtPct(allTime.pct)} />
        <Stat label="Championships" value={String(rings.length)} sub={rings.join(", ") || "—"} gold={rings.length > 0} />
        <Stat label="Playoffs" value={`${playoffYears}`} sub={`of ${seasons.length} seasons`} />
        <Stat label="Best season" value={String(best.year)} sub={`${fmtRecord(best.wins, best.losses, best.ties)} · ${ordinal(best.place)}`} />
      </div>
      {runnerUps.length > 0 && <p className="mt-3 text-sm text-mute">Runner-up: {runnerUps.join(", ")}</p>}
      {played2020 && <Note2020>All-time record counts 2020 as one normal season. Best season leaves 2020 out.</Note2020>}

      {roster.length > 0 && (
        <>
          <SectionTitle kicker={`${cur.year} roster`}>Roster</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            {ROSTER_GROUPS.map(({ status, label }) => {
              const players = roster.filter((p) => p.status === status);
              if (!players.length) return null;
              return (
                <Card key={status}>
                  <p className="border-b border-line px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wider text-mute">
                    {label} · {players.length}
                  </p>
                  <ul className="divide-y divide-line/60 text-sm">
                    {players.map((p) => (
                      <li key={p.player_id} className="flex items-center gap-2.5 px-3 py-1.5">
                        <span className="w-10 shrink-0 font-display text-xs font-semibold uppercase text-mute">{p.slot}</span>
                        {p.headshot_url ? (
                          <img src={p.headshot_url} alt="" width={28} height={28} loading="lazy" className="h-7 w-7 shrink-0 rounded-full bg-navy-800 object-cover" />
                        ) : (
                          <span className="h-7 w-7 shrink-0 rounded-full bg-navy-800" aria-hidden />
                        )}
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        <span className="shrink-0 text-xs text-mute">{p.positions} · {p.mlb_team}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
          <div className="mt-1"><UpdatedLine status={cur.sync.get("rosters")} /></div>
        </>
      )}

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
          <SectionTitle kicker={current}>Head-to-head</SectionTitle>
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
          <p className="mt-2 text-xs text-mute">
            Every regular-season meeting since 2019 (except 2020&apos;s all-play weeks) plus every playoff meeting since 2007.
          </p>
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
