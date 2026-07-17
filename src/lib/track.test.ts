import { describe, it, expect, vi, afterEach } from "vitest";
import { track } from "./track";

afterEach(() => {
  vi.restoreAllMocks();
  delete (navigator as { sendBeacon?: unknown }).sendBeacon;
});

describe("track", () => {
  it("uses navigator.sendBeacon when available, posting to /api/event", () => {
    const beacon = vi.fn((_url: string, _body?: BodyInit | null): boolean => true);
    (navigator as unknown as { sendBeacon: typeof beacon }).sendBeacon = beacon;
    track({ kind: "copy", hex: "#008080", os: "windows-95" });
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe("/api/event");
  });

  it("sends the event payload as the beacon body", async () => {
    let captured = "";
    const beacon = vi.fn((_url: string, body: Blob) => { captured = "blob"; void body; return true; });
    (navigator as unknown as { sendBeacon: typeof beacon }).sendBeacon = beacon;
    track({ kind: "osview", os: "kde-2" });
    expect(beacon).toHaveBeenCalledWith("/api/event", expect.any(Blob));
    expect(captured).toBe("blob");
  });

  it("falls back to fetch with keepalive when sendBeacon is absent", () => {
    // ensure no beacon
    delete (navigator as { sendBeacon?: unknown }).sendBeacon;
    const fetchMock = vi.fn((_url: string, _init?: RequestInit): Promise<Response> =>
      Promise.resolve(new Response(null, { status: 204 }))
    );
    vi.stubGlobal("fetch", fetchMock);
    track({ kind: "download", hex: "#3a6ea5", os: "windows-nt-4-0" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/event");
    expect(init).toMatchObject({ method: "POST", keepalive: true });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ kind: "download", hex: "#3a6ea5", os: "windows-nt-4-0" });
  });

  it("never throws when transports fail", () => {
    const beacon = vi.fn((_url: string, _body?: BodyInit | null): boolean => { throw new Error("boom"); });
    (navigator as unknown as { sendBeacon: typeof beacon }).sendBeacon = beacon;
    expect(() => track({ kind: "osview", os: "kde-2" })).not.toThrow();
  });
});
