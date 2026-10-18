"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

// Finishes a sign-in from Supabase's standard email link: the login arrives
// after "#" in the address, so it's read here in the browser and saved as the session.
export default function ConfirmSignIn() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    if (!access_token || !refresh_token) {
      setFailed(true);
      return;
    }
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      if (error) setFailed(true);
      else window.location.replace("/admin");
    });
  }, []);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      {failed ? (
        <p>
          That sign-in link didn&apos;t work (it may have expired).{" "}
          <a href="/login" className="text-red hover:underline">Request a new one</a>.
        </p>
      ) : (
        <p className="text-mute">Signing you in…</p>
      )}
    </div>
  );
}
