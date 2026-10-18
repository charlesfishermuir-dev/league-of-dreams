import { createClient } from "@supabase/supabase-js";

// Read-only client. The publishable key can only do what the database's
// row-level security allows, which for visitors is reading.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {
    auth: { persistSession: false },
    // Next.js caches fetches; keep database reads at most a minute old so
    // live scores and newly synced seasons show up.
    global: { fetch: (input, init) => fetch(input, { ...init, next: { revalidate: 60 } }) },
  },
);

/** Fetch every row of a table, paging past Supabase's 1,000-row response cap. */
export async function fetchAll<T>(table: string, columns = "*"): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Loading ${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < pageSize) return rows;
  }
}

/** Same read-only client, but never cached: for data that must be up to the second (the lottery). */
export const supabaseFresh = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { persistSession: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } },
);
