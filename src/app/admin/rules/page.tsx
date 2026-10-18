import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { Flash, Label, MARKDOWN_HINT } from "@/components/admin";
import { requireAdmin } from "@/lib/supabase-server";
import { restoreRules, saveRules } from "../actions";

type Props = { searchParams: Promise<{ saved?: string; error?: string }> };
type Version = { id: number; body: string; note: string | null; created_at: string; created_by: string | null };

const STARTER = `# League of Dreams Constitution

## 1. Format
12 teams, head-to-head categories. Categories: R, HR, RBI, SB, AVG, OPS, K, W, L, SV, ERA, WHIP.

## 2. Keepers

## 3. Draft

## 4. Trades

## 5. Playoffs
Top 4 teams make the playoffs.
`;

export default async function AdminRules({ searchParams }: Props) {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("rules_versions").select("*").order("id", { ascending: false }).limit(20);
  const versions = (data ?? []) as Version[];
  const current = versions[0];
  const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <>
      <PageTitle kicker="Commissioner" sub={<>Shown on the public <Link href="/rules" className="text-red hover:underline">Rules page</Link>. Every save is kept, so you can always go back.</>}>
        League rules
      </PageTitle>
      <Flash sp={await searchParams} />
      <form action={saveRules} className="space-y-4">
        <div>
          <Label htmlFor="body" hint={MARKDOWN_HINT}>Constitution</Label>
          <textarea id="body" name="body" rows={24} defaultValue={current?.body ?? STARTER} className="field font-mono text-sm" />
        </div>
        <div>
          <Label htmlFor="note" hint="optional, shown in the history below">What changed?</Label>
          <input id="note" name="note" placeholder="e.g. Keeper deadline moved to March 1" className="field" />
        </div>
        <button className="btn">Save rules</button>
      </form>

      {versions.length > 0 && (
        <>
          <h2 className="mb-2 mt-10 font-display text-lg font-bold uppercase tracking-wide">History</h2>
          <Card>
            <ul className="divide-y divide-line text-sm">
              {versions.map((v, i) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <span>
                    <span className="font-semibold">{fmt(v.created_at)}</span>
                    {i === 0 && <span className="ml-2 rounded bg-emerald-500/20 px-1.5 text-[11px] font-bold uppercase text-emerald-300">Current</span>}
                    {v.note && <span className="block text-mute">{v.note}</span>}
                  </span>
                  {i > 0 && (
                    <form action={restoreRules}>
                      <input type="hidden" name="id" value={v.id} />
                      <button className="text-sm font-semibold text-red hover:underline">Restore this version</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
