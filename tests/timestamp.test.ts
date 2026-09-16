import * as asn1js from "asn1js";
import { TimeStampReq } from "pkijs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HASH_OID_SHA256 } from "../src/lib/constants";
import { equalBytes, sha256Bytes } from "../src/lib/hash";
import { createTimestampRequest, requestFreeTsaTimestamp, TIMESTAMP_CLIENT_TIMEOUT_MS, verifyTimestamp } from "../src/lib/timestamp";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function bodyBytes(body: BodyInit | null | undefined): Uint8Array {
  if (!(body instanceof ArrayBuffer)) throw new Error("Expected timestamp request body to be an ArrayBuffer.");
  return new Uint8Array(body);
}

describe("RFC 3161 request", () => {
  it("binds SHA-256 data and includes a nonce and certificate request", async () => {
    const data = new TextEncoder().encode("synthetic ProofStamp test");
    const requestBytes = await createTimestampRequest(data);
    const request = TimeStampReq.fromBER(requestBytes.buffer as ArrayBuffer);
    expect(request.version).toBe(1);
    expect(request.certReq).toBe(true);
    expect(request.messageImprint.hashAlgorithm.algorithmId).toBe(HASH_OID_SHA256);
    expect(equalBytes(new Uint8Array(request.messageImprint.hashedMessage.getValue()), await sha256Bytes(data))).toBe(true);
    expect(request.nonce).toBeInstanceOf(asn1js.Integer);
  });

  it("fails closed on a malformed timestamp response", async () => {
    const data = new TextEncoder().encode("manifest");
    const request = await createTimestampRequest(data);
    await expect(verifyTimestamp(data, request, new Uint8Array([1, 2, 3, 4]))).rejects.toThrow();
  });
});

describe("timestamp transport privacy", () => {
  it("sends only the timestamp-query bytes to the same-origin relay", async () => {
    const tsq = new Uint8Array([48, 1, 0]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/timestamp");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({ "Content-Type": "application/timestamp-query" });
      expect(bodyBytes(init?.body)).toEqual(tsq);
      return new Response(new Uint8Array([48, 0]), { status: 200, headers: { "Content-Type": "application/timestamp-reply" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestFreeTsaTimestamp(tsq);
    expect(result.transport).toBe("relay");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not try another destination when the relay fails", async () => {
    const tsq = new Uint8Array([48, 2, 1, 0]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/timestamp");
      expect(bodyBytes(init?.body)).toEqual(tsq);
      throw new TypeError("simulated relay failure");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestFreeTsaTimestamp(tsq)).rejects.toThrow("through the ProofStamp relay");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("times out a stalled relay request instead of leaving creation busy indefinitely", async () => {
    vi.useFakeTimers();
    const tsq = new Uint8Array([48, 3, 2, 1, 0]);
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error("Expected a fetch abort signal."));
        return;
      }
      if (signal.aborted) {
        reject(new Error("simulated abort"));
        return;
      }
      signal.addEventListener("abort", () => reject(new Error("simulated timeout abort")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = requestFreeTsaTimestamp(tsq);
    const assertion = expect(pending).rejects.toThrow("Timestamp request timed out. Try again.");
    await vi.advanceTimersByTimeAsync(TIMESTAMP_CLIENT_TIMEOUT_MS);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
