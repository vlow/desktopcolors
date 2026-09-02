// A provenance note's `text` is authored with exactly two markers:
//   [Label]  → a link, its href looked up in the entry's `links` map
//   `code`   → a <code> span
// Everything else is literal. Two markers is the whole language, deliberately —
// a note needing more than links and code is too elaborate for this block.
//
// One tokenizer, two consumers: the Zod schema (via sourceNoteLinkErrors) and
// the view builder (via parseSourceNote). If validation and rendering disagreed
// about what counts as a marker, the build would pass on a note that renders
// wrong — the single failure this module exists to exclude.

export type SourceNode =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string }
  | { kind: "link"; label: string; url: string };

export type Token =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string }
  | { kind: "marker"; label: string };

/**
 * Split `text` into literal runs, code spans and `[Label]` markers.
 *
 * An unclosed `[` or backtick is literal text, not an error: prose contains
 * stray brackets and a build must not fail on one. Markers never nest — the
 * first delimiter opened runs until its own closer, so a `[` inside a code span
 * and a backtick inside a label are both just characters.
 */
export function tokenizeSourceNote(text: string): Token[] {
  const out: Token[] = [];
  let lit = "";
  const flush = () => {
    if (lit) out.push({ kind: "text", value: lit });
    lit = "";
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "[" || ch === "`") {
      const close = text.indexOf(ch === "[" ? "]" : "`", i + 1);
      // close === i + 1 is an empty marker ("[]" / "``"); leave it literal.
      if (close > i + 1) {
        flush();
        const inner = text.slice(i + 1, close);
        out.push(ch === "[" ? { kind: "marker", label: inner } : { kind: "code", value: inner });
        i = close;
        continue;
      }
    }
    lit += ch;
  }
  flush();
  return out;
}

/** Distinct `[Label]`s in `text`, in first-occurrence order. */
function markersOf(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokenizeSourceNote(text)) {
    if (t.kind === "marker" && !seen.has(t.label)) {
      seen.add(t.label);
      out.push(t.label);
    }
  }
  return out;
}

/**
 * Build-time cross-check between a note's markers and its link map. Returns one
 * message per problem, empty when the note is sound.
 *
 * Both directions matter. An uncited marker renders as literal brackets, which
 * nobody catches in review; an unused link entry is dead data, usually a rename.
 */
export function sourceNoteLinkErrors(text: string, links: Record<string, string>): string[] {
  const markers = markersOf(text);
  const cited = new Set(markers);
  const errs: string[] = [];
  for (const label of markers) {
    if (!(label in links)) errs.push(`source note cites [${label}] but "links" has no such entry`);
  }
  for (const key of Object.keys(links)) {
    if (!cited.has(key)) errs.push(`source note "links" entry "${key}" is never cited as [${key}] in "text"`);
  }
  return errs;
}

/**
 * Parse a note into render-ready nodes.
 *
 * Total by construction: an unresolved marker degrades to literal text rather
 * than throwing. Unreachable in practice — the schema rejects it first — but a
 * pure function that cannot fail is easier to test and cannot take a build down.
 */
export function parseSourceNote(text: string, links: Record<string, string>): SourceNode[] {
  return tokenizeSourceNote(text).map((t): SourceNode => {
    if (t.kind !== "marker") return t;
    const url = links[t.label];
    return url === undefined
      ? { kind: "text", value: `[${t.label}]` }
      : { kind: "link", label: t.label, url };
  });
}
