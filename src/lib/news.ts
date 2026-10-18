import { supabase } from "./supabase";

export type NewsKind = "announcement" | "trade" | "power_rankings" | "recap";
export type NewsPost = {
  id: number;
  slug: string;
  kind: NewsKind;
  title: string;
  body: string;
  published: boolean;
  published_at: string | null;
  updated_at: string;
};

export const NEWS_KINDS: Record<NewsKind, string> = {
  announcement: "Announcement",
  trade: "Trade breakdown",
  power_rankings: "Power rankings",
  recap: "Weekly recap",
};

/** Published posts, newest first (visitors only ever see published ones). */
export async function loadNews(limit = 50): Promise<NewsPost[]> {
  const { data, error } = await supabase.from("news").select("id, slug, kind, title, body, published, published_at, updated_at").eq("published", true)
    .order("published_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Loading news: ${error.message}`);
  return (data ?? []) as NewsPost[];
}

export async function loadPost(slug: string): Promise<NewsPost | null> {
  const { data } = await supabase.from("news").select("id, slug, kind, title, body, published, published_at, updated_at").eq("slug", slug).eq("published", true).maybeSingle();
  return (data as NewsPost) ?? null;
}

/** First paragraph of a post as plain text, for previews. */
export function excerpt(body: string, max = 180): string {
  const para = body.split(/\n\s*\n/).find((p) => p.trim() && !p.trim().startsWith("#")) ?? "";
  const plain = para.replace(/[*_`>#]|\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
  return plain.length > max ? `${plain.slice(0, max).replace(/\s+\S*$/, "")}…` : plain;
}

export const fmtNewsDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "long", day: "numeric", year: "numeric" }) : "";
