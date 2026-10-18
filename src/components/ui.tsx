import Link from "next/link";
import type { Finish } from "@/lib/history";
import { FINISH_LABEL } from "@/lib/history";

/** Broadcast-style section title: red tab + condensed caps. */
export function SectionTitle({ children, kicker }: { children: React.ReactNode; kicker?: string }) {
  return (
    <div className="mb-3 mt-10 flex items-end gap-3 first:mt-0">
      <span className="h-7 w-1.5 shrink-0 bg-red" aria-hidden />
      <div>
        {kicker && <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red">{kicker}</p>}
        <h2 className="font-display text-2xl font-bold uppercase leading-none tracking-wide">{children}</h2>
      </div>
    </div>
  );
}

export function PageTitle({ children, kicker, sub }: { children: React.ReactNode; kicker?: string; sub?: React.ReactNode }) {
  return (
    <div className="mb-8">
      {kicker && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.25em] text-red">{kicker}</p>}
      <h1 className="font-display text-4xl font-bold uppercase leading-[0.95] tracking-wide sm:text-5xl">{children}</h1>
      {sub && <div className="mt-2 text-mute">{sub}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-line bg-navy-900/80 ${className}`}>{children}</div>;
}

const FINISH_STYLE: Record<NonNullable<Finish>, string> = {
  champion: "bg-gold text-ink",
  runner_up: "bg-chalk/90 text-ink",
  third: "bg-navy-600 text-chalk",
  fourth: "bg-navy-600 text-chalk",
  semifinal: "bg-navy-600 text-chalk",
};

export function FinishBadge({ finish }: { finish: Finish }) {
  if (!finish) return null;
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 font-display text-[11px] font-semibold uppercase tracking-wider ${FINISH_STYLE[finish]}`}>
      {finish === "champion" ? "🏆 " : ""}
      {FINISH_LABEL[finish]}
    </span>
  );
}

export function TeamLink({ slug, children }: { slug: string; children: React.ReactNode }) {
  return (
    <Link href={`/teams/${slug}`} className="font-medium hover:text-red hover:underline">
      {children}
    </Link>
  );
}

/** Pill-style switcher driven by the URL, e.g. ?era=post. */
export function Tabs({ items, active }: { items: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1.5">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          scroll={false}
          className={`rounded-full px-3 py-1 text-sm font-semibold ${
            i.key === active ? "bg-red text-white" : "bg-navy-800 text-mute hover:text-chalk"
          }`}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}

export const th = "px-2 py-2 text-left font-display text-xs font-semibold uppercase tracking-wider text-mute";
export const td = "px-2 py-2";

/** Short footnote pointing to the full explanation of how 2020 is counted. */
export function Note2020({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-xs text-mute">
      <span className="text-chalk">*</span> {children}{" "}
      <Link href="/history#how-2020-counts" className="text-red hover:underline">How 2020 is counted →</Link>
    </p>
  );
}

/** The full explanation, shown on the History page (and the 2020 season page). */
export function How2020Counts() {
  return (
    <Card className="relative overflow-hidden p-5 pl-6">
      <div id="how-2020-counts" className="absolute -top-28" aria-hidden />
      <div className="absolute inset-y-0 left-0 w-1.5 bg-red" aria-hidden />
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red">League note</p>
      <h3 className="font-display text-xl font-bold uppercase">How the 2020 season is counted</h3>
      <p className="mt-2 text-sm text-mute">
        2020 was the 60-game COVID season, and we played it <span className="text-chalk">all-play</span>: every week,
        every team faced all 11 other teams. That makes a 2020 record about 3½ times the size of a normal season&apos;s
        (around 924 category decisions instead of 264, e.g. 594-269-61), so adding it straight into totals would let
        2020 outweigh every other year. Here&apos;s how the site handles it:
      </p>
      <ul className="mt-3 space-y-2 text-sm">
        <li><span className="font-semibold">All-time records and win %:</span> 2020 counts as <span className="text-chalk">one normal season</span>. Each team&apos;s 2020 record is scaled down to 264 category decisions, keeping the same win %.</li>
        <li><span className="font-semibold">Single-season records and leaderboards</span> (best and worst seasons, category leaders): 2020 is <span className="text-chalk">left out</span>. A 60-game, all-play season isn&apos;t comparable.</li>
        <li><span className="font-semibold">Head-to-head:</span> 2020&apos;s regular-season weeks are left out, since everyone played everyone every week. The 2020 playoffs count normally.</li>
        <li><span className="font-semibold">Championships, playoff appearances and finishes:</span> count normally. The 2020 title is a full ring.</li>
      </ul>
      <p className="mt-3 text-sm text-mute">
        The <Link href="/history/2020" className="text-red hover:underline">2020 season page</Link> always shows the actual results as played.
      </p>
    </Card>
  );
}
