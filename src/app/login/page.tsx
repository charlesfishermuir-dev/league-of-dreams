import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Card, PageTitle } from "@/components/ui";
import { createClient } from "@supabase/supabase-js";

export const metadata: Metadata = { title: "Commissioner sign-in", robots: { index: false } };

const MESSAGES: Record<string, string> = {
  sent: "Check your email for a sign-in link. It works once and expires in an hour.",
  "not-commissioner": "That account isn't on the commissioner list.",
  "link-failed": "That sign-in link didn't work (it may have expired or been opened in a different browser). Request a new one.",
  "send-failed": "Couldn't send the email. Wait a few minutes and try again.",
};

async function sendLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  // "Implicit" links carry the login with them, so they work in any browser (e.g. a phone's mail
  // app), not only the one that asked for the email. /auth/confirm finishes the sign-in.
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Only existing accounts can sign in; nobody can create one from this form.
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/callback` },
  });
  // Same message whether or not the email is a commissioner, so the form doesn't reveal who is.
  if (error && !/signups not allowed|not found|otp_disabled/i.test(error.message)) {
    console.error("sign-in email failed:", error.message);
    redirect("/login?status=send-failed");
  }
  redirect("/login?status=sent");
}

type Props = { searchParams: Promise<{ status?: string; error?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const message = MESSAGES[sp.status ?? sp.error ?? ""];
  return (
    <div className="mx-auto max-w-md">
      <PageTitle kicker="Commissioner" sub="League members don't need to sign in. Everything is public.">Sign in</PageTitle>
      {message && (
        <Card className={`mb-4 p-4 text-sm ${sp.status === "sent" ? "border-emerald-500/50" : "border-red/60"}`}>{message}</Card>
      )}
      <Card className="p-5">
        <form action={sendLink} className="space-y-3">
          <label className="block text-sm font-semibold" htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-md border border-line bg-ink px-3 py-2 text-base outline-none focus:border-red"
          />
          <button className="w-full rounded-md bg-red px-4 py-2 font-display font-semibold uppercase tracking-wider text-white hover:bg-red-dark">
            Email me a sign-in link
          </button>
        </form>
      </Card>
    </div>
  );
}
