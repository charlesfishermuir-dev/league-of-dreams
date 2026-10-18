import Link from "next/link";
import type { Metadata } from "next";
import { Card, PageTitle } from "@/components/ui";
import { excerpt, fmtNewsDate, loadNews, NEWS_KINDS } from "@/lib/news";

export const metadata: Metadata = { title: "News" };
export const revalidate = 60;

export default async function NewsPage() {
  const posts = await loadNews();
  return (
    <>
      <PageTitle kicker="From the commissioner" sub="Announcements, trade breakdowns and power rankings.">News</PageTitle>
      {posts.length === 0 ? (
        <Card className="p-6 text-center text-mute">Nothing posted yet. Check back soon.</Card>
      ) : (
        <div className="grid gap-3">
          {posts.map((p, i) => (
            <Link key={p.id} href={`/news/${p.slug}`} className="group">
              <Card className={`relative overflow-hidden p-5 transition group-hover:border-red ${i === 0 ? "sm:p-7" : ""}`}>
                <div className="absolute inset-y-0 left-0 w-1.5 bg-red opacity-0 transition group-hover:opacity-100" aria-hidden />
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red">
                  {NEWS_KINDS[p.kind]} · <span className="text-mute">{fmtNewsDate(p.published_at)}</span>
                </p>
                <h2 className={`mt-1 font-display font-bold uppercase leading-tight ${i === 0 ? "text-3xl sm:text-4xl" : "text-2xl"}`}>{p.title}</h2>
                {excerpt(p.body) && <p className="mt-2 text-mute">{excerpt(p.body)}</p>}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
