import type { SourceNode } from "../lib/sourceNote";

// Renders a parsed provenance note. Nodes arrive already parsed from the build
// (see src/lib/sourceNote.ts), so no parsing happens in the browser.
//
// Every anchor gets target/rel here and only here: an author writes a [Label]
// and a URL, never an element, so there is no call site that can forget them.
export function SourceNote({ nodes }: { nodes: SourceNode[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (n.kind === "link") {
          return (
            <a key={i} href={n.url} target="_blank" rel="noopener" style="color: var(--accent-strong);">
              {n.label}
            </a>
          );
        }
        if (n.kind === "code") {
          return <code key={i} style="font: 400 12px var(--font-mono);">{n.value}</code>;
        }
        return <span key={i}>{n.value}</span>;
      })}
    </>
  );
}
