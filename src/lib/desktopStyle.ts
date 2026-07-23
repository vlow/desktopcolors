/**
 * The desktop "chrome" styles a preview can render. This is the single source of
 * truth for the style list: the content schema (`src/content/config.ts`) derives
 * its Zod enum from `DESKTOP_STYLES`, and the preview registry
 * (`src/islands/DesktopPreview.tsx`) maps each one to its chrome.
 *
 * This module intentionally has no `astro:content` dependency, so it can be
 * imported at runtime by unit tests (unlike `config.ts`).
 *
 * To add a preview style, see `docs/adding-a-preview-style.md`.
 */
export const DESKTOP_STYLES = ["modern", "win9x", "win31", "platinum", "beos", "amiga", "kde", "cde", "gem", "generic"] as const;

export type DesktopStyle = (typeof DESKTOP_STYLES)[number];
