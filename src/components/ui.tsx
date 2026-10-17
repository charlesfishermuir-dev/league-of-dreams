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
