import { useEffect, useState } from "preact/hooks";

const NARROW_QUERY = "(max-width: 759.98px)";

/**
 * True when the viewport is below the site's 760px mobile breakpoint.
 * SSR-safe: defaults to false so the first client render matches the server,
 * then a post-mount effect reads matchMedia and subscribes to changes.
 */
export function useIsNarrow(query: string = NARROW_QUERY): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const update = () => setNarrow(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);
  return narrow;
}
