import * as asn1js from "asn1js";
import { TimeStampReq } from "pkijs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HASH_OID_SHA256 } from "../src/lib/constants";
import { equalBytes, sha256Bytes } from "../src/lib/hash";
import { createTimestampRequest, requestFreeTsaTimestamp, verifyTimestamp } from "../src/lib/timestamp";

afterEach(() => vi.unstubAllGlobals());

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
  it("sends only the timestamp-query bytes on the direct path", async () => {
    const tsq = new Uint8Array([48, 1, 0]);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({ "Content-Type": "application/timestamp-query" });
      expect(init?.body).toBe(tsq);
      return new Response(new Uint8Array([48, 0]), { status: 200, headers: { "Content-Type": "application/timestamp-reply" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestFreeTsaTimestamp(tsq);
    expect(result.transport).toBe("direct");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the same bounded protocol request without adding file metadata", async () => {
    const tsq = new Uint8Array([48, 2, 1, 0]);
    const calls: Array<{ input: RequestInfo | URL; body: BodyInit | null | undefined }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, body: init?.body });
      if (calls.length === 1) throw new TypeError("simulated browser CORS/network failure");
      return new Response(new Uint8Array([48, 0]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestFreeTsaTimestamp(tsq);
    expect(result.transport).toBe("relay");
    expect(String(calls[1].input)).toBe("/api/timestamp");
    expect(calls[1].body).toBe(tsq);
  });
});
