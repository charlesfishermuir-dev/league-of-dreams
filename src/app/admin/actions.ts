"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, supabaseForUser } from "@/lib/supabase-server";

// Every action re-checks the commissioner login, and the database checks it
// again on every write. After a change, the public pages refresh immediately.

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const refreshSite = () => revalidatePath("/", "layout");

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

// ---------- sign out ----------

export async function signOut() {
  const supabase = await supabaseForUser();
  await supabase.auth.signOut();
  redirect("/");
}

// ---------- news ----------

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "post";

export async function saveNews(formData: FormData) {
  const { supabase, email } = await requireAdmin();
  const id = Number(formData.get("id")) || null;
  const title = text(formData, "title");
  const intent = text(formData, "intent"); // 'draft' | 'publish' | 'unpublish'
  const back = id ? `/admin/news/${id}` : "/admin/news/new";
  if (!title) fail(back, "A title is needed.");

  const fields: Record<string, unknown> = {
    title,
    kind: text(formData, "kind") || "announcement",
    body: String(formData.get("body") ?? ""),
    updated_at: new Date().toISOString(),
  };
  if (intent === "publish") fields.published = true;
  if (intent === "unpublish") fields.published = false;

  if (id) {
    if (intent === "publish") {
      const { data: existing } = await supabase.from("news").select("published_at").eq("id", id).single();
      if (!existing?.published_at) fields.published_at = new Date().toISOString();
    }
    const { error } = await supabase.from("news").update(fields).eq("id", id);
    if (error) fail(back, error.message);
    refreshSite();
    redirect(`/admin/news/${id}?saved=1`);
  }

  // New post: make a unique web address from the title.
  let slug = slugify(title);
  const { data: taken } = await supabase.from("news").select("slug").like("slug", `${slug}%`);
  if (taken?.some((r) => r.slug === slug)) slug = `${slug}-${(taken?.length ?? 0) + 1}`;
  const { data, error } = await supabase
    .from("news")
    .insert({ ...fields, slug, author_email: email, published: intent === "publish",
              published_at: intent === "publish" ? new Date().toISOString() : null })
    .select("id")
    .single();
  if (error || !data) fail(back, error?.message ?? "Couldn't save.");
  refreshSite();
  redirect(`/admin/news/${data.id}?saved=1`);
}

export async function deleteNews(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = Number(formData.get("id"));
  if (text(formData, "confirm") !== "DELETE") fail(`/admin/news/${id}`, 'Type DELETE in the box to confirm.');
  const { error } = await supabase.from("news").delete().eq("id", id);
  if (error) fail(`/admin/news/${id}`, error.message);
  refreshSite();
  redirect("/admin/news?deleted=1");
}

// ---------- rules ----------

export async function saveRules(formData: FormData) {
  const { supabase, email } = await requireAdmin();
  const body = String(formData.get("body") ?? "");
  const { error } = await supabase.from("rules_versions").insert({ body, note: text(formData, "note") || null, created_by: email });
  if (error) fail("/admin/rules", error.message);
  refreshSite();
  redirect("/admin/rules?saved=1");
}

export async function restoreRules(formData: FormData) {
  const { supabase, email } = await requireAdmin();
  const id = Number(formData.get("id"));
  const { data: old } = await supabase.from("rules_versions").select("body, created_at").eq("id", id).single();
  if (!old) fail("/admin/rules", "That version wasn't found.");
  const when = new Date(old.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const { error } = await supabase.from("rules_versions").insert({ body: old.body, note: `Restored the version from ${when}`, created_by: email });
  if (error) fail("/admin/rules", error.message);
  refreshSite();
  redirect("/admin/rules?saved=1");
}

// ---------- awards ----------

export async function addAward(formData: FormData) {
  const { supabase } = await requireAdmin();
  const year = Number(formData.get("year"));
  const name = text(formData, "name");
  const franchiseId = Number(formData.get("franchise_id")) || null;
  const recipient = text(formData, "recipient") || null;
  if (!year || !name) fail("/admin/awards", "Year and award name are needed.");
  if (!franchiseId && !recipient) fail("/admin/awards", "Choose a team or type who won it.");
  const { error } = await supabase.from("awards").insert({ year, name, franchise_id: franchiseId, recipient, note: text(formData, "note") || null });
  if (error) fail("/admin/awards", error.message);
  refreshSite();
  redirect("/admin/awards?saved=1");
}

export async function deleteAward(formData: FormData) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("awards").delete().eq("id", Number(formData.get("id")));
  if (error) fail("/admin/awards", error.message);
  refreshSite();
  redirect("/admin/awards?deleted=1");
}

// ---------- record corrections ----------

const NUMBER_FIELDS = new Set(["wins", "losses", "ties", "place"]);

export async function saveCorrection(formData: FormData) {
  const { supabase, email } = await requireAdmin();
  const year = Number(formData.get("year"));
  const franchiseId = Number(formData.get("franchise_id"));
  const field = text(formData, "field");
  const value = text(formData, "value");
  const reason = text(formData, "reason");
  const back = `/admin/corrections?year=${year}`;
  if (!year || !franchiseId || !field) fail(back, "Choose a season, team and what to change.");
  if (!reason) fail(back, "Add a short reason, so everyone knows why it changed.");
  if ((NUMBER_FIELDS.has(field) || field.startsWith("stats.")) && (value === "" || Number.isNaN(Number(value)))) {
    fail(back, "That field needs a number.");
  }

  const { data: ts } = await supabase.from("team_seasons").select("*").eq("year", year).eq("franchise_id", franchiseId).single();
  if (!ts) fail(back, "That team didn't play that season.");
  const current = field.startsWith("stats.") ? ts.stats?.[field.slice(6)] : ts[field];

  // Keep the original value from the first correction, so deleting it can put things back.
  const { data: existing } = await supabase.from("record_overrides").select("old_value")
    .eq("year", year).eq("franchise_id", franchiseId).eq("field", field).maybeSingle();
  const { error } = await supabase.from("record_overrides").upsert({
    year, franchise_id: franchiseId, field, value: value === "" ? null : value, reason, created_by: email,
    old_value: existing ? existing.old_value : current == null ? null : String(current),
  }, { onConflict: "year,franchise_id,field" });
  if (error) fail(back, error.message);
  const { error: applyError } = await supabase.rpc("apply_record_overrides");
  if (applyError) fail(back, applyError.message);
  refreshSite();
  redirect(`${back}&saved=1`);
}

export async function deleteCorrection(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = Number(formData.get("id"));
  const { data: o } = await supabase.from("record_overrides").select("*").eq("id", id).single();
  if (!o) fail("/admin/corrections", "That correction wasn't found.");
  const { error } = await supabase.from("record_overrides").delete().eq("id", id);
  if (error) fail("/admin/corrections", error.message);
  await supabase.rpc("restore_record_field", { p_year: o.year, p_franchise: o.franchise_id, p_field: o.field, p_value: o.old_value });
  refreshSite();
  redirect(`/admin/corrections?year=${o.year}&deleted=1`);
}
