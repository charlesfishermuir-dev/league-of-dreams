import { Card, PageTitle } from "@/components/ui";
import { Flash, Label } from "@/components/admin";
import { requireAdmin } from "@/lib/supabase-server";
import { loadHistory } from "@/lib/history";
import { addAward, deleteAward } from "../actions";

type Props = { searchParams: Promise<{ saved?: string; deleted?: string; error?: string }> };
type Award = { id: number; year: number; name: string; franchise_id: number | null; recipient: string | null; note: string | null };

export default async function AdminAwards({ searchParams }: Props) {
  const { supabase } = await requireAdmin();
  const h = await loadHistory();
  const { data } = await supabase.from("awards").select("*").order("year", { ascending: false }).order("name");
  const awards = (data ?? []) as Award[];
  const names = [...new Set(awards.map((a) => a.name))];
  const lastYear = h.seasons.at(-1)!.year;
  const teamName = (a: Award) => (a.franchise_id ? h.teamSeason.get(`${a.year}:${a.franchise_id}`)?.team_name ?? h.franchiseById.get(a.franchise_id)?.name : null);

  return (
    <>
      <PageTitle kicker="Commissioner" sub="Shown in the trophy case on the History page and on each team's page. Championships are added automatically.">
        Awards
      </PageTitle>
      <Flash sp={await searchParams} />

      <Card className="p-4">
        <form action={addAward} className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="name">Award</Label>
            <input id="name" name="name" required list="award-names" placeholder="e.g. Sacko, MVP, Trade of the Year" className="field" />
            <datalist id="award-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
          </div>
          <div>
            <Label htmlFor="year">Season</Label>
            <select id="year" name="year" defaultValue={lastYear} className="field">
              {[...h.seasons].reverse().map((s) => <option key={s.year} value={s.year}>{s.year}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="franchise_id">Team</Label>
            <select id="franchise_id" name="franchise_id" defaultValue="" className="field">
              <option value="">(not a team)</option>
              {[...h.franchises].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)).map((f) => (
                <option key={f.id} value={f.id}>{f.name}{f.active ? "" : " (former)"}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="recipient" hint="optional">Player or detail</Label>
            <input id="recipient" name="recipient" placeholder="e.g. Aaron Judge" className="field" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="note" hint="optional">Note</Label>
            <input id="note" name="note" placeholder="e.g. Finished 51-195-18" className="field" />
          </div>
          <div><button className="btn">Add award</button></div>
        </form>
      </Card>

      <h2 className="mb-2 mt-8 font-display text-lg font-bold uppercase tracking-wide">In the trophy case</h2>
      {awards.length === 0 ? (
        <Card className="p-5 text-center text-mute">No awards yet.</Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line text-sm">
            {awards.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-12 font-display font-bold num">{a.year}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{a.name}</span>
                  <span className="text-mute"> · {[teamName(a), a.recipient].filter(Boolean).join(" · ")}</span>
                  {a.note && <span className="block text-xs text-mute">{a.note}</span>}
                </span>
                <form action={deleteAward}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="text-xs font-semibold text-mute hover:text-red" aria-label={`Remove ${a.name} ${a.year}`}>Remove</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
