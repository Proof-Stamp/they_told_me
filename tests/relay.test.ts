import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequest } from "../functions/api/timestamp";

afterEach(() => vi.unstubAllGlobals());

function streamedBody(chunkSize: number, chunkCount: number, onCancel: () => void, onPull?: () => void): ReadableStream<Uint8Array> {
  let emitted = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      onPull?.();
      if (emitted >= chunkCount) {
        controller.close();
        return;
      }
      emitted += 1;
      controller.enqueue(new Uint8Array(chunkSize));
    },
    cancel() {
      onCancel();
    },
  });
}

function postWithStream(body: ReadableStream<Uint8Array>): Request {
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: { "Content-Type": "application/timestamp-query" },
    body,
    duplex: "half",
  };
  return new Request("https://preview.example/api/timestamp", init);
}

describe("Cloudflare timestamp relay", () => {
  it("accepts only timestamp-query POSTs and forwards to the fixed authority", async () => {
    const query = new Uint8Array([48, 3, 2, 1, 0]);
    const upstream = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://freetsa.org/tsr");
      expect(init?.method).toBe("POST");
      expect(new Uint8Array(init?.body as ArrayBuffer)).toEqual(query);
      expect(init?.redirect).toBe("manual");
      return new Response(new Uint8Array([48, 0]), { status: 200 });
    });
    vi.stubGlobal("fetch", upstream);

    const request = new Request("https://preview.example/api/timestamp", {
      method: "POST",
      headers: { "Content-Type": "application/timestamp-query" },
      body: query,
    });
    const response = await onRequest({ request });
    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("rejects unrelated methods and content types before an upstream request", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    const getResponse = await onRequest({ request: new Request("https://preview.example/api/timestamp") });
    expect(getResponse.status).toBe(405);

    const postResponse = await onRequest({
      request: new Request("https://preview.example/api/timestamp", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }),
    });
    expect(postResponse.status).toBe(415);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects oversized request bodies", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const request = new Request("https://preview.example/api/timestamp", {
      method: "POST",
      headers: { "Content-Type": "application/timestamp-query" },
      body: new Uint8Array(8193),
    });
    const response = await onRequest({ request });
    expect(response.status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("stops reading an oversized streamed request without Content-Length and never contacts FreeTSA", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    let cancelled = false;
    let pulls = 0;
    const request = postWithStream(streamedBody(4096, 10, () => { cancelled = true; }, () => { pulls += 1; }));

    const response = await onRequest({ request });

    expect(response.status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(10);
  });

  it("stops reading an oversized streamed upstream response", async () => {
    let cancelled = false;
    let pulls = 0;
    const upstream = vi.fn(async () => new Response(
      streamedBody(16 * 1024, 10, () => { cancelled = true; }, () => { pulls += 1; }),
      { status: 200 },
    ));
    vi.stubGlobal("fetch", upstream);
    const request = new Request("https://preview.example/api/timestamp", {
      method: "POST",
      headers: { "Content-Type": "application/timestamp-query" },
      body: new Uint8Array([48, 0]),
    });

    const response = await onRequest({ request });

    expect(response.status).toBe(502);
    expect(await response.text()).toMatch(/invalid response size/i);
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(10);
  });

  it("does not follow an unexpected upstream redirect", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 302, headers: { Location: "https://example.invalid/" } })));
    const request = new Request("https://preview.example/api/timestamp", {
      method: "POST",
      headers: { "Content-Type": "application/timestamp-query" },
      body: new Uint8Array([48, 0]),
    });
    const response = await onRequest({ request });
    expect(response.status).toBe(502);
    expect(await response.text()).toBe("Timestamp authority returned HTTP 302.");
  });
});
