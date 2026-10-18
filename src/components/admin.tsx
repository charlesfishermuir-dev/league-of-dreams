import { Card } from "@/components/ui";

/** Success / error banner driven by ?saved=1, ?deleted=1 or ?error=... in the URL. */
export function Flash({ sp }: { sp: { saved?: string; deleted?: string; error?: string } }) {
  if (sp.error) return <Card className="mb-4 border-red/60 p-3 text-sm">⚠ {sp.error}</Card>;
  if (sp.saved) return <Card className="mb-4 border-emerald-500/50 p-3 text-sm">✓ Saved. The public site is updated.</Card>;
  if (sp.deleted) return <Card className="mb-4 border-emerald-500/50 p-3 text-sm">✓ Deleted.</Card>;
  return null;
}

export function Label({ htmlFor, children, hint }: { htmlFor: string; children: React.ReactNode; hint?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-semibold">
      {children}
      {hint && <span className="ml-2 font-normal text-mute">{hint}</span>}
    </label>
  );
}

export const MARKDOWN_HINT = "**bold**, *italic*, ## Heading, - list item, [link](https://…)";
