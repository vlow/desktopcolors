export type TrackEvent =
  | { kind: "copy"; hex: string; os: string }
  | { kind: "download"; hex: string; os: string }
  | { kind: "osview"; os: string };

const ENDPOINT = "/api/event";

/**
 * Fire-and-forget popularity beacon. Prefers navigator.sendBeacon (survives
 * page unload), falls back to fetch with keepalive. Browser-only; a no-op
 * during SSR/build. Never throws — tracking must not disrupt the UI.
 */
export function track(event: TrackEvent): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify(event);
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
      return;
    }
    if (typeof fetch === "function") {
      void fetch(ENDPOINT, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body,
      }).catch(() => {});
    }
  } catch {
    /* fire-and-forget: swallow everything */
  }
}
