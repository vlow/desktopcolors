export type TrackEvent =
  | { kind: "copy"; hex: string; os: string }
  | { kind: "download"; hex: string; os: string }
  | { kind: "osview"; os: string };

/**
 * No-op popularity event seam. Plan 4 replaces the body with a fire-and-forget
 * POST to /api/event. Kept as a single import so islands never inline transport.
 */
export function track(event: TrackEvent): void {
  if (import.meta.env.DEV) console.debug("[track]", event);
}
