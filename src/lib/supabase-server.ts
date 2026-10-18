import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/** A Supabase client acting as the signed-in visitor (used by the commissioner pages). */
export async function supabaseForUser() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a page render, where cookies are read-only; the middleware refreshes them instead.
        }
      },
    },
  });
}

/**
 * For commissioner pages and actions: returns the client and email, or sends
 * the visitor to the login page. The database checks admin rights again on
 * every write, so this is a convenience, not the only lock.
 */
export async function requireAdmin() {
  const supabase = await supabaseForUser();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/login?error=not-commissioner");
  return { supabase, email: data.user.email ?? "" };
}
