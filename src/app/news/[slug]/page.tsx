import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Markdown } from "@/components/markdown";
import { excerpt, fmtNewsDate, loadPost, NEWS_KINDS } from "@/lib/news";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await loadPost((await params).slug);
  return post ? { title: post.title, description: excerpt(post.body) } : { title: "News" };
}

export default async function NewsPost({ params }: Props) {
  const post = await loadPost((await params).slug);
  if (!post) notFound();
  return (
    <article className="mx-auto max-w-2xl">
      <Link href="/news" className="text-sm font-semibold text-mute hover:text-chalk">← All news</Link>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-red">
        {NEWS_KINDS[post.kind]} · <span className="text-mute">{fmtNewsDate(post.published_at)}</span>
      </p>
      <h1 className="mb-6 mt-1 font-display text-4xl font-bold uppercase leading-[0.95] tracking-wide sm:text-5xl">{post.title}</h1>
      <Markdown>{post.body}</Markdown>
    </article>
  );
}
