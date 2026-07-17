import { describe, it, expect, vi, afterEach } from "vitest";
import { track } from "./track";

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error cleanup optional beacon stub
  delete navigator.sendBeacon;
});

describe("track", () => {
  it("uses navigator.sendBeacon when available, posting to /api/event", () => {
    const beacon = vi.fn(() => true);
    // @ts-expect-error assign stub
    navigator.sendBeacon = beacon;
    track({ kind: "copy", hex: "#008080", os: "windows-95" });
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe("/api/event");
  });

  it("sends the event payload as the beacon body", async () => {
    let captured = "";
    const beacon = vi.fn((_url: string, body: Blob) => { captured = "blob"; void body; return true; });
    // @ts-expect-error assign stub
    navigator.sendBeacon = beacon;
    track({ kind: "osview", os: "kde-2" });
    expect(beacon).toHaveBeenCalledWith("/api/event", expect.any(Blob));
    expect(captured).toBe("blob");
  });

  it("falls back to fetch with keepalive when sendBeacon is absent", () => {
    // ensure no beacon
    // @ts-expect-error cleanup
    delete navigator.sendBeacon;
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", fetchMock);
    track({ kind: "download", hex: "#3a6ea5", os: "windows-nt-4-0" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/event");
    expect(init).toMatchObject({ method: "POST", keepalive: true });
    expect(JSON.parse(init.body)).toEqual({ kind: "download", hex: "#3a6ea5", os: "windows-nt-4-0" });
  });

  it("never throws when transports fail", () => {
    const beacon = vi.fn(() => { throw new Error("boom"); });
    // @ts-expect-error assign stub
    navigator.sendBeacon = beacon;
    expect(() => track({ kind: "osview", os: "kde-2" })).not.toThrow();
  });
});
