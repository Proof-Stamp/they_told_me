import { describe, expect, it } from "vitest";
import { createTimestampRequest, parseTimestampRequest } from "../src/lib/rfc3161";

const digest = new Uint8Array(32).fill(7);

describe("RFC 3161 request", () => {
  it("round-trips SHA-256 digest and nonce", () => {
    const nonce = Uint8Array.from([1,2,3,4,5,6,7,8]);
    const request = createTimestampRequest(digest, nonce.slice());
    const parsed = parseTimestampRequest(request.bytes);
    expect(Array.from(parsed.digest)).toEqual(Array.from(digest));
    expect(Array.from(parsed.nonce)).toEqual(Array.from(nonce));
  });
});
