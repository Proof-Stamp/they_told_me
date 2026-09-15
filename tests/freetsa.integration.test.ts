import { execFileSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FREETSA_CA_FILE_SHA256,
  FREETSA_CA_SHA256,
  FREETSA_TSA_FILE_SHA256,
  FREETSA_TSA_SHA256,
} from "../src/lib/constants";
import { sha256Hex } from "../src/lib/hash";
import { createTimestampRequest, derToPem, verifyTimestamp } from "../src/lib/timestamp";

function certificateFingerprint(certificate: X509Certificate): string {
  return certificate.fingerprint256.replaceAll(":", "").toLowerCase();
}

async function requestFreeTsaDirect(request: Uint8Array): Promise<Uint8Array> {
  const response = await fetch("https://freetsa.org/tsr", {
    method: "POST",
    headers: {
      "Content-Type": "application/timestamp-query",
      Accept: "application/timestamp-reply, application/octet-stream",
    },
    body: request,
  });
  if (!response.ok) throw new Error(`FreeTSA returned HTTP ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error("FreeTSA returned an empty timestamp response.");
  return bytes;
}

describe("FreeTSA live RFC 3161 integration", () => {
  it("validates a real response in JS and independently with OpenSSL", async () => {
    const tsaFile = new Uint8Array(await (await fetch("https://freetsa.org/files/tsa.crt")).arrayBuffer());
    const caFile = new Uint8Array(await (await fetch("https://freetsa.org/files/cacert.pem")).arrayBuffer());

    expect(await sha256Hex(tsaFile)).toBe(FREETSA_TSA_FILE_SHA256);
    expect(await sha256Hex(caFile)).toBe(FREETSA_CA_FILE_SHA256);
    expect(certificateFingerprint(new X509Certificate(Buffer.from(tsaFile)))).toBe(FREETSA_TSA_SHA256);
    expect(certificateFingerprint(new X509Certificate(Buffer.from(caFile)))).toBe(FREETSA_CA_SHA256);

    const manifestBytes = new TextEncoder().encode('{"synthetic":true,"purpose":"They Told Me integration test"}\n');
    const request = await createTimestampRequest(manifestBytes);
    const response = await requestFreeTsaDirect(request);
    const verified = await verifyTimestamp(manifestBytes, request, response);

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
    writeFileSync(responsePath, response);
    writeFileSync(tsaPath, verified.tsaCertificatePem);
    writeFileSync(caPath, verified.caCertificatePem);

    const common = ["-CAfile", caPath, "-untrusted", tsaPath];
    const pair = execFileSync("openssl", ["ts", "-verify", "-in", responsePath, "-queryfile", requestPath, ...common], { encoding: "utf8" });
    const exactManifest = execFileSync("openssl", ["ts", "-verify", "-in", responsePath, "-data", manifestPath, ...common], { encoding: "utf8" });
    expect(pair).toMatch(/Verification: OK/);
    expect(exactManifest).toMatch(/Verification: OK/);

    const forged = new Uint8Array(response);
    forged[forged.length - 1] ^= 1;
    await expect(verifyTimestamp(manifestBytes, request, forged)).rejects.toThrow();

    expect(derToPem(new Uint8Array([1, 2, 3]))).toContain("BEGIN CERTIFICATE");
  }, 30_000);
});
