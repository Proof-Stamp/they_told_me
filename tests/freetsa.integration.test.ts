import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTimestampRequest, derToPem, requestFreeTsaTimestamp, verifyTimestamp } from "../src/lib/timestamp";

describe("FreeTSA live RFC 3161 integration", () => {
  it("validates a real response in JS and independently with OpenSSL", async () => {
    const manifestBytes = new TextEncoder().encode('{"synthetic":true,"purpose":"They Told Me integration test"}\n');
    const request = await createTimestampRequest(manifestBytes);
    const transport = await requestFreeTsaTimestamp(request);
    const verified = await verifyTimestamp(manifestBytes, request, transport.bytes);

    expect(verified.signedTime.getTime()).toBeLessThanOrEqual(Date.now() + 60_000);
    expect(verified.revocationChecked).toBe(false);

    const dir = mkdtempSync(join(tmpdir(), "they-told-me-rfc3161-"));
    const manifestPath = join(dir, "proof.json");
    const requestPath = join(dir, "timestamp.tsq");
    const responsePath = join(dir, "timestamp.tsr");
    const tsaPath = join(dir, "tsa.pem");
    const caPath = join(dir, "ca.pem");
    writeFileSync(manifestPath, manifestBytes);
    writeFileSync(requestPath, request);
    writeFileSync(responsePath, transport.bytes);
    writeFileSync(tsaPath, verified.tsaCertificatePem);
    writeFileSync(caPath, verified.caCertificatePem);

    const common = ["-CAfile", caPath, "-untrusted", tsaPath];
    const pair = execFileSync("openssl", ["ts", "-verify", "-in", responsePath, "-queryfile", requestPath, ...common], { encoding: "utf8" });
    const exactManifest = execFileSync("openssl", ["ts", "-verify", "-in", responsePath, "-data", manifestPath, ...common], { encoding: "utf8" });
    expect(pair).toMatch(/Verification: OK/);
    expect(exactManifest).toMatch(/Verification: OK/);

    const forged = new Uint8Array(transport.bytes);
    forged[forged.length - 1] ^= 1;
    await expect(verifyTimestamp(manifestBytes, request, forged)).rejects.toThrow();

    expect(derToPem(new Uint8Array([1, 2, 3]))).toContain("BEGIN CERTIFICATE");
  }, 30_000);
});
