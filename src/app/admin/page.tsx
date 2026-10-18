import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { UpdatedLine } from "@/components/live";
import { requireAdmin } from "@/lib/supabase-server";
import type { SyncStatus } from "@/lib/live";

export default async function AdminHome() {
  const { supabase } = await requireAdmin();
  const [{ count: drafts }, { count: published }, { data: rules }, { count: awards }, { count: corrections }, { data: sync }] =
    await Promise.all([
      supabase.from("news").select("id", { count: "exact", head: true }).eq("published", false),
      supabase.from("news").select("id", { count: "exact", head: true }).eq("published", true),
      supabase.from("rules_versions").select("created_at").order("id", { ascending: false }).limit(1),
      supabase.from("awards").select("id", { count: "exact", head: true }),
      supabase.from("record_overrides").select("id", { count: "exact", head: true }),
      supabase.from("sync_status").select("*").order("dataset"),
    ]);

  const tiles = [
    { href: "/admin/news/new", title: "Write a post", body: `${published ?? 0} published · ${drafts ?? 0} draft${drafts === 1 ? "" : "s"}` },
    { href: "/admin/rules", title: "Edit the rules", body: rules?.[0] ? `Last changed ${new Date(rules[0].created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "Not written yet" },
    { href: "/admin/awards", title: "Awards", body: `${awards ?? 0} in the trophy case` },
    { href: "/admin/corrections", title: "Correct a record", body: `${corrections ?? 0} website correction${corrections === 1 ? "" : "s"}` },
  ];

  return (
    <>
      <PageTitle kicker="Commissioner">Dashboard</PageTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="group">
            <Card className="h-full p-4 transition group-hover:border-red">
              <p className="font-display text-xl font-bold uppercase">{t.title} →</p>
              <p className="text-sm text-mute">{t.body}</p>
            </Card>
          </Link>
        ))}
      </div>

      <h2 className="mb-2 mt-8 font-display text-lg font-bold uppercase tracking-wide">Fantrax sync</h2>
      <Card className="divide-y divide-line">
        {(sync as SyncStatus[] | null)?.map((s) => (
          <div key={s.dataset} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
            <span className="font-semibold capitalize">{s.dataset}</span>
            <UpdatedLine status={s} label="Last good sync" />
            {s.ok === false && <p className="w-full text-xs text-red">{s.message}</p>}
          </div>
        ))}
      </Card>
    </>
  );
}
