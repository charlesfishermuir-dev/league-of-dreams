import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageTitle } from "@/components/ui";
import { Flash, Label, MARKDOWN_HINT } from "@/components/admin";
import { Markdown } from "@/components/markdown";
import { requireAdmin } from "@/lib/supabase-server";
import { NEWS_KINDS, type NewsPost } from "@/lib/news";
import { deleteNews, saveNews } from "../../actions";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> };

export default async function EditNews({ params, searchParams }: Props) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  let post: NewsPost | null = null;
  if (id !== "new") {
    const { data } = await supabase.from("news").select("*").eq("id", Number(id)).maybeSingle();
    if (!data) notFound();
    post = data as NewsPost;
  }

  return (
    <>
      <Link href="/admin/news" className="text-sm font-semibold text-mute hover:text-chalk">← All posts</Link>
      <PageTitle kicker={post ? (post.published ? "Published" : "Draft") : "New post"}>{post ? "Edit post" : "Write a post"}</PageTitle>
      <Flash sp={await searchParams} />

      <form action={saveNews} className="space-y-4">
        {post && <input type="hidden" name="id" value={post.id} />}
        <div>
          <Label htmlFor="title">Headline</Label>
          <input id="title" name="title" required defaultValue={post?.title} className="field" />
        </div>
        <div>
          <Label htmlFor="kind">Type</Label>
          <select id="kind" name="kind" defaultValue={post?.kind ?? "announcement"} className="field">
            {Object.entries(NEWS_KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="body" hint={MARKDOWN_HINT}>Story</Label>
          <textarea id="body" name="body" rows={16} defaultValue={post?.body} className="field font-mono text-sm" />
        </div>
        <div className="flex flex-wrap gap-2">
          {(!post || !post.published) && <button name="intent" value="publish" className="btn">Publish</button>}
          {post?.published && <button name="intent" value="draft" className="btn">Save changes</button>}
          {(!post || !post.published) && <button name="intent" value="draft" className="btn-quiet">Save as draft</button>}
          {post?.published && <button name="intent" value="unpublish" className="btn-quiet">Unpublish</button>}
          {post?.published && <Link href={`/news/${post.slug}`} className="btn-quiet">View on site ↗</Link>}
        </div>
      </form>

      {post && post.body.trim() && (
        <>
          <h2 className="mb-2 mt-10 font-display text-lg font-bold uppercase tracking-wide text-mute">Preview (last saved)</h2>
          <Card className="p-5">
            <h1 className="mb-3 font-display text-3xl font-bold uppercase leading-tight">{post.title}</h1>
            <Markdown>{post.body}</Markdown>
          </Card>
        </>
      )}

      {post && (
        <form action={deleteNews} className="mt-10 rounded-lg border border-red/40 p-4">
          <input type="hidden" name="id" value={post.id} />
          <p className="mb-2 text-sm font-semibold text-red">Delete this post</p>
          <p className="mb-2 text-xs text-mute">This can&apos;t be undone. To keep it but hide it, use Unpublish instead. Type DELETE to confirm.</p>
          <div className="flex gap-2">
            <input name="confirm" placeholder="DELETE" className="field max-w-40" />
            <button className="btn-quiet">Delete</button>
          </div>
        </form>
      )}
    </>
  );
}
