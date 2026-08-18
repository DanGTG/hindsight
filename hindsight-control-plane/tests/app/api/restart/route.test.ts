import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/restart/route";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("restart API proxy", () => {
  it("returns the accepted instance and configured recovery timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ accepted: true, instance_id: "old-instance", delay_seconds: 1 }),
            { status: 202, headers: { "Content-Type": "application/json" } }
          )
        )
    );

    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      accepted: true,
      instance_id: "old-instance",
      recovery_timeout_seconds: 120,
    });
  });

  it("does not report ready while the original process is still serving", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ instance_id: "old-instance" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const response = await GET(
      new Request("http://control-plane/api/restart?previousInstanceId=old-instance")
    );

    expect(await response.json()).toEqual({
      reachable: true,
      ready: false,
      instance_id: "old-instance",
    });
  });

  it("reports ready only when a different process instance is healthy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ instance_id: "new-instance" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const response = await GET(
      new Request("http://control-plane/api/restart?previousInstanceId=old-instance")
    );

    expect(await response.json()).toMatchObject({ reachable: true, ready: true });
  });

  it("treats dataplane downtime as an expected recovery state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));

    const response = await GET(
      new Request("http://control-plane/api/restart?previousInstanceId=old-instance")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reachable: false, ready: false });
  });
});
