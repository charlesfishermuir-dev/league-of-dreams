import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/supabase-server";
import { signOut } from "./actions";

export const metadata: Metadata = { title: "Commissioner", robots: { index: false } };
export const dynamic = "force-dynamic";

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/news", label: "News" },
  { href: "/admin/rules", label: "Rules" },
  { href: "/admin/awards", label: "Awards" },
  { href: "/admin/lottery", label: "Draft lottery" },
  { href: "/admin/corrections", label: "Corrections" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireAdmin();
  return (
    <>
      <div className="mb-6 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            <span className="font-display font-bold uppercase tracking-wider text-gold">Commissioner</span>
            <span className="text-mute"> · {email}</span>
          </p>
          <form action={signOut}>
            <button className="text-sm font-semibold text-mute hover:text-chalk">Sign out</button>
          </form>
        </div>
        <nav className="mt-2 flex flex-wrap gap-1.5">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-full bg-navy-800 px-3 py-1 text-sm font-semibold text-mute hover:text-chalk">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </>
  );
}
