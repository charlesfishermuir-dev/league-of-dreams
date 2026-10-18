import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { Flash } from "@/components/admin";
import { requireAdmin } from "@/lib/supabase-server";
import { NEWS_KINDS, type NewsPost } from "@/lib/news";

type Props = { searchParams: Promise<{ deleted?: string; error?: string }> };

export default async function AdminNewsList({ searchParams }: Props) {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("news").select("*").order("published", { ascending: true })
    .order("published_at", { ascending: false, nullsFirst: true }).order("updated_at", { ascending: false });
  const posts = (data ?? []) as NewsPost[];

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <PageTitle kicker="Commissioner">News</PageTitle>
        <Link href="/admin/news/new" className="btn shrink-0">+ New post</Link>
      </div>
      <Flash sp={await searchParams} />
      {posts.length === 0 ? (
        <Card className="p-5 text-center text-mute">No posts yet. Write the first one!</Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {posts.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/news/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-navy-800/60">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.title}</span>
                    <span className="block text-xs text-mute">
                      {NEWS_KINDS[p.kind]} · {p.published_at ? new Date(p.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "not published"}
                    </span>
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold uppercase ${p.published ? "bg-emerald-500/20 text-emerald-300" : "bg-navy-700 text-mute"}`}>
                    {p.published ? "Live" : "Draft"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
