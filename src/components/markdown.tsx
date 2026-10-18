import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders commissioner-written Markdown (news, rules). Raw HTML is ignored,
 * so nothing typed into a post can run as code on the site.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-lod">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
