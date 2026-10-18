import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { Flash, Label } from "@/components/admin";
import { requireAdmin } from "@/lib/supabase-server";
import { fmtRecord, loadHistory } from "@/lib/history";
import { deleteCorrection, saveCorrection } from "../actions";

type Props = { searchParams: Promise<{ year?: string; saved?: string; deleted?: string; error?: string }> };
type Override = { id: number; year: number; franchise_id: number; field: string; value: string | null; old_value: string | null; reason: string; created_at: string };

const FIELDS: [string, string][] = [
  ["wins", "Wins"], ["losses", "Losses"], ["ties", "Ties"], ["place", "Regular-season place"],
  ["team_name", "Team name"], ["finish", "Playoff finish (champion, runner_up, semifinal, third, fourth, or blank)"],
  ...["R", "HR", "RBI", "SB", "AVG", "OPS", "K", "W", "L", "SV", "ERA", "WHIP"].map((c): [string, string] => [`stats.${c}`, `Season ${c}`]),
];
const fieldLabel = Object.fromEntries(FIELDS);

export default async function AdminCorrections({ searchParams }: Props) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const h = await loadHistory();
  const years = h.seasons.map((s) => s.year).reverse();
  const year = years.includes(Number(sp.year)) ? Number(sp.year) : years[0];
  const teams = h.teamSeasons.filter((t) => t.year === year).sort((a, b) => a.place - b.place);
  const { data } = await supabase.from("record_overrides").select("*").order("year", { ascending: false }).order("id");
  const overrides = (data ?? []) as Override[];
  const name = (o: Override) => h.teamSeason.get(`${o.year}:${o.franchise_id}`)?.team_name ?? h.franchiseById.get(o.franchise_id)?.name;

  return (
    <>
      <PageTitle
        kicker="Commissioner"
        sub="Fix a record or stat on the site. Corrections stay in place when the history import or Fantrax sync runs again, and deleting one puts the old value back."
      >
        Correct a record
      </PageTitle>
      <Flash sp={sp} />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {years.map((y) => (
          <Link key={y} href={`/admin/corrections?year=${y}`} className={`rounded-full px-3 py-1 text-sm font-semibold ${y === year ? "bg-red text-white" : "bg-navy-800 text-mute hover:text-chalk"}`}>
            {y}
          </Link>
        ))}
      </div>

      <Card className="p-4">
        <form action={saveCorrection} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="year" value={year} />
          <div>
            <Label htmlFor="franchise_id">{year} team</Label>
            <select id="franchise_id" name="franchise_id" required className="field">
              {teams.map((t) => (
                <option key={t.franchise_id} value={t.franchise_id}>
                  {t.place}. {t.team_name} ({fmtRecord(t.wins, t.losses, t.ties)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="field">What to change</Label>
            <select id="field" name="field" required className="field">
              {FIELDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="value">Correct value</Label>
            <input id="value" name="value" className="field" placeholder="e.g. 131" />
          </div>
          <div>
            <Label htmlFor="reason">Reason</Label>
            <input id="reason" name="reason" required className="field" placeholder="e.g. Typo in the original spreadsheet" />
          </div>
          <div><button className="btn">Save correction</button></div>
        </form>
      </Card>

      <h2 className="mb-2 mt-8 font-display text-lg font-bold uppercase tracking-wide">Website corrections</h2>
      {overrides.length === 0 ? (
        <Card className="p-5 text-center text-sm text-mute">
          None yet. (The 50 fixes to the spreadsheet are in <code>data/corrections.json</code> and are applied by the import.)
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line text-sm">
            {overrides.map((o) => (
              <li key={o.id} className="flex items-start gap-3 px-4 py-2.5">
                <span className="w-12 font-display font-bold num">{o.year}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{name(o)}</span>
                  <span className="text-mute"> · {fieldLabel[o.field] ?? o.field}: </span>
                  <span className="num">{o.old_value ?? "–"} → <span className="text-chalk">{o.value ?? "–"}</span></span>
                  <span className="block text-xs text-mute">{o.reason}</span>
                </span>
                <form action={deleteCorrection}>
                  <input type="hidden" name="id" value={o.id} />
                  <button className="text-xs font-semibold text-mute hover:text-red">Undo</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
