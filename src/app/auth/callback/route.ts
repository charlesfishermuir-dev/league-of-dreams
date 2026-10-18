import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseForUser } from "@/lib/supabase-server";

// The sign-in email links here. Two kinds of link are accepted:
//  - ?token_hash=...&type=email : works in any browser (e.g. a phone's mail app)
//  - ?code=...                  : Supabase's default link; only works in the browser that asked for it
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const supabase = await supabaseForUser();
  const tokenHash = url.searchParams.get("token_hash");
  const code = url.searchParams.get("code");

  let ok = false;
  if (tokenHash) {
    const type = (url.searchParams.get("type") ?? "email") as EmailOtpType;
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }
  return NextResponse.redirect(new URL(ok ? "/admin" : "/login?error=link-failed", url.origin));
}
