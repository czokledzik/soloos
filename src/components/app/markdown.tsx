"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { MermaidDiagram } from "./mermaid-diagram";

const components = (interactiveDiagrams: boolean): Components => ({
  a: ({ href, title, children }) => (
    <a href={href} title={title} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const lang = /language-(\w+)/.exec(className ?? "")?.[1];
    if (lang === "mermaid") return <MermaidDiagram code={String(children).trim()} interactive={interactiveDiagrams} />;
    return <code className={className}>{children}</code>;
  },
  // Mermaid diagrams shouldn't sit inside a <pre> box.
  pre: ({ node, children, ...props }) => {
    const child = node?.children[0];
    const isMermaid =
      child?.type === "element" &&
      child.tagName === "code" &&
      String((child.properties?.className as string[] | undefined)?.join(" ") ?? "").includes("language-mermaid");
    return isMermaid ? <>{children}</> : <pre {...props}>{children}</pre>;
  },
});
const INTERACTIVE = components(true);
const STATIC = components(false);

/**
 * GitHub-flavoured markdown with Mermaid code blocks. Raw HTML in the source is not rendered.
 * `staticDiagrams` draws diagrams fitted to the width instead of in a pan/zoom box (print/PDF).
 */
export function Markdown({
  children,
  className,
  staticDiagrams = false,
}: {
  children: string;
  className?: string;
  staticDiagrams?: boolean;
}) {
  return (
    <div
      className={cn(
        "max-w-none text-sm leading-relaxed break-words",
        "[&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold",
        "[&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:font-semibold [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_li]:my-0.5 [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-[0.85em] [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_table]:my-3 [&_table]:w-full [&_table]:text-left [&_td]:border-t [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_th]:font-medium [&_hr]:my-4",
        "[&_input[type=checkbox]]:mr-1.5 [&>*:first-child]:mt-0",
        // Print/PDF: keep headings (and a line introducing a list or table) with what follows; don't split rows or list items.
        "[&_h1]:break-after-avoid [&_h2]:break-after-avoid [&_h3]:break-after-avoid [&_p:has(+ul,+ol,+table)]:break-after-avoid [&_li]:break-inside-avoid [&_tr]:break-inside-avoid",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={staticDiagrams ? STATIC : INTERACTIVE}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
