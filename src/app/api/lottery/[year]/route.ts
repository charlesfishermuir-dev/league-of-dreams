import { NextResponse } from "next/server";
import { supabaseFresh } from "@/lib/supabase";

// The countdown asks this every few seconds once the clock hits zero.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ year: string }> }) {
  const year = Number((await params).year);
  const [{ data: schedule }, { data: drawn }] = await Promise.all([
    supabaseFresh.from("lottery_schedule").select("run_at, status, last_error").eq("year", year).maybeSingle(),
    supabaseFresh.from("draft_lotteries").select("year").eq("year", year).maybeSingle(),
  ]);
  return NextResponse.json({ drawn: Boolean(drawn), schedule }, { headers: { "Cache-Control": "no-store" } });
}
