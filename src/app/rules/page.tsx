import type { Metadata } from "next";
import { Card, PageTitle } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { supabase } from "@/lib/supabase";

export const metadata: Metadata = { title: "Rules" };
export const revalidate = 60;

export default async function RulesPage() {
  const { data } = await supabase.from("rules_versions").select("body, created_at").order("id", { ascending: false }).limit(1);
  const current = data?.[0];
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        kicker="League constitution"
        sub={current ? `Last updated ${new Date(current.created_at).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "long", day: "numeric", year: "numeric" })}` : undefined}
      >
        Rules
      </PageTitle>
      {current?.body.trim() ? (
        <Markdown>{current.body}</Markdown>
      ) : (
        <Card className="p-6 text-center text-mute">The commissioner hasn&apos;t posted the rules yet.</Card>
      )}
    </div>
  );
}
