import type { Metadata } from "next";
import { Card, Note2020, PageTitle, SectionTitle, Tabs, TeamLink, td, th } from "@/components/ui";
import {
  fmtPct, fmtRecord, fmtStat, headToHead, inSeasonRecords, INF_SPOT_YEAR, loadHistory, LOWER_IS_BETTER,
  managerTotals, ordinal, SHORT_SEASON, winPct, type TeamSeason,
} from "@/lib/history";

export const metadata: Metadata = { title: "Records" };
export const revalidate = 300;

const CATS = ["R", "HR", "RBI", "SB", "AVG", "OPS", "K", "W", "L", "SV", "ERA", "WHIP"];
const ERAS = {
  all: { label: "All years", test: () => true },
  pre: { label: `Pre INF spot (–${INF_SPOT_YEAR - 1})`, test: (y: number) => y < INF_SPOT_YEAR },
  post: { label: `INF spot era (${INF_SPOT_YEAR}–)`, test: (y: number) => y >= INF_SPOT_YEAR },
} as const;
type Era = keyof typeof ERAS;

type Props = { searchParams: Promise<{ cat?: string; era?: string; mgr?: string }> };

export default async function RecordsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const cat = CATS.includes(sp.cat ?? "") ? sp.cat! : "HR";
  const era: Era = sp.era && sp.era in ERAS ? (sp.era as Era) : "all";
  const h = await loadHistory();
  const slug = (id: number) => h.franchiseById.get(id)!.slug;
  const href = (p: { cat?: string; era?: string; mgr?: string }) => {
    const q = new URLSearchParams({ cat, era, ...(sp.mgr ? { mgr: sp.mgr } : {}), ...p });
    return `/records?${q}`;
  };

  // ---- category leaderboards ----
  const pool = h.teamSeasons.filter(
    (t) => ERAS[era].test(t.year) && t.stats[cat] !== undefined && inSeasonRecords(t),
  );
  const lowBetter = LOWER_IS_BETTER.has(cat);
  const sorted = [...pool].sort((a, b) => (lowBetter ? a.stats[cat] - b.stats[cat] : b.stats[cat] - a.stats[cat]));
  const best = sorted.slice(0, 10);
  const worst = sorted.slice(-10).reverse();

  // ---- best / worst seasons by win % ----
  const byPct = h.teamSeasons.filter(inSeasonRecords).sort((a, b) => winPct(b.wins, b.losses, b.ties) - winPct(a.wins, a.losses, a.ties));

  // ---- playoff dominance ----
  const playoff = h.matchups.filter((m) => m.stage !== "regular");
  const blowouts = [...playoff].sort((a, b) => Math.abs(b.home_w - b.home_l) - Math.abs(a.home_w - a.home_l)).slice(0, 5);

  // ---- head-to-head ----
  const managers = managerTotals(h).sort((a, b) => a.manager.localeCompare(b.manager));
  const mgr = managers.find((m) => m.managerSlug === sp.mgr) ?? managers.find((m) => m.active)!;
  const h2h = headToHead(h, mgr.manager);

  return (
    <>
      <PageTitle kicker="Record book" sub="Calculated straight from the season results, so they update themselves.">
        All-Time Records
      </PageTitle>

      <SectionTitle kicker="Single season">Category leaders</SectionTitle>
      <Tabs active={cat} items={CATS.map((c) => ({ key: c, label: c, href: href({ cat: c }) }))} />
      <Tabs active={era} items={(Object.keys(ERAS) as Era[]).map((e) => ({ key: e, label: ERAS[e].label, href: href({ era: e }) }))} />
      <div className="grid gap-4 md:grid-cols-2">
        <Leaderboard title={`Best ${cat} seasons`} rows={best} cat={cat} slug={slug} />
        <Leaderboard title={`Worst ${cat} seasons`} rows={worst} cat={cat} slug={slug} startRank={sorted.length - 9} reverse />
      </div>
      <Note2020>
        {SHORT_SEASON} is left out of single-season records. {cat === "OPS" ? "OPS was added in 2012. " : ""}
        The INF roster spot was added in {INF_SPOT_YEAR}, which inflated hitting numbers.
      </Note2020>

      <SectionTitle kicker="Regular season">Best &amp; worst records</SectionTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <RecordList title="Best seasons" rows={byPct.slice(0, 10)} slug={slug} />
        <RecordList title="Worst seasons" rows={byPct.slice(-10).reverse()} slug={slug} />
      </div>
      <Note2020>{SHORT_SEASON} is left out of best and worst seasons.</Note2020>

      <SectionTitle kicker="Playoffs">Most lopsided playoff matchups</SectionTitle>
      <Card>
        <ul className="divide-y divide-line text-sm">
          {blowouts.map((m) => {
            const homeWon = m.winner_id === m.home_id;
            const winner = h.teamSeason.get(`${m.year}:${homeWon ? m.home_id : m.away_id}`)!;
            const loser = h.teamSeason.get(`${m.year}:${homeWon ? m.away_id : m.home_id}`)!;
            const [w, l] = homeWon ? [m.home_w, m.home_l] : [m.home_l, m.home_w];
            return (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-10 font-display font-bold num">{m.year}</span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{winner.team_name}</span>
                  <span className="text-mute"> over {loser.team_name}</span>
                </span>
                <span className="font-display text-lg font-bold num">{w}-{l}{m.home_t ? `-${m.home_t}` : ""}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      <SectionTitle kicker="Rivalries">Head-to-head</SectionTitle>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {managers.filter((m) => m.active).map((m) => (
          <a
            key={m.manager}
            href={href({ mgr: m.managerSlug }) + "#h2h"}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${m.manager === mgr.manager ? "bg-red text-white" : "bg-navy-800 text-mute hover:text-chalk"}`}
          >
            {m.manager}
          </a>
        ))}
      </div>
      <Card className="table-scroll">
        <table id="h2h" className="w-full text-sm">
          <thead className="border-b border-line">
            <tr>
              <th className={th}>{mgr.manager} vs</th>
              <th className={`${th} text-right`}>Meetings</th>
              <th className={`${th} text-right`}>W-L-T</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {h2h.length === 0 && (
              <tr><td className={`${td} text-mute`} colSpan={3}>No meetings recorded yet.</td></tr>
            )}
            {h2h.map((r) => (
              <tr key={r.opponent}>
                <td className={td}>{r.opponent}</td>
                <td className={`${td} num text-right`}>{r.meetings}</td>
                <td className={`${td} num text-right font-semibold`}>{fmtRecord(r.w, r.l, r.t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-2 text-xs text-mute">
        Every regular-season meeting since 2019 plus every playoff meeting since 2007. 2020&apos;s all-play weeks are left out.
      </p>
    </>
  );
}

function Leaderboard({ title, rows, cat, slug, startRank = 1, reverse }: {
  title: string; rows: TeamSeason[]; cat: string; slug: (id: number) => string; startRank?: number; reverse?: boolean;
}) {
  const total = startRank + rows.length - 1;
  return (
    <Card>
      <p className="border-b border-line px-4 py-2 font-display text-sm font-semibold uppercase tracking-wider text-mute">{title}</p>
      <ol className="divide-y divide-line text-sm">
        {rows.map((t, i) => (
          <li key={t.id} className="flex items-center gap-3 px-4 py-2">
            <span className="w-6 text-right text-mute num">{reverse ? total - i : startRank + i}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate"><TeamLink slug={slug(t.franchise_id)}>{t.team_name}</TeamLink></span>
              <span className="block truncate text-xs text-mute">{t.year} · {t.manager_label}</span>
            </span>
            <span className={`font-display text-lg font-bold num ${!reverse && i === 0 ? "text-gold" : ""}`}>{fmtStat(cat, t.stats[cat])}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function RecordList({ title, rows, slug }: { title: string; rows: TeamSeason[]; slug: (id: number) => string }) {
  return (
    <Card>
      <p className="border-b border-line px-4 py-2 font-display text-sm font-semibold uppercase tracking-wider text-mute">{title}</p>
      <ol className="divide-y divide-line text-sm">
        {rows.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-4 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate"><TeamLink slug={slug(t.franchise_id)}>{t.team_name}</TeamLink></span>
              <span className="block truncate text-xs text-mute">
                {t.year} · {t.manager_label} · {ordinal(t.place)}
              </span>
            </span>
            <span className="text-right">
              <span className="block font-display text-lg font-bold num">{fmtPct(winPct(t.wins, t.losses, t.ties))}</span>
              <span className="block text-xs text-mute num">{fmtRecord(t.wins, t.losses, t.ties)}</span>
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
