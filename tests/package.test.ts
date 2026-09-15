import { BlobReader, BlobWriter, TextReader, Uint8ArrayReader, ZipWriter } from "@zip.js/zip.js";
import { describe, expect, it } from "vitest";
import { buildManifest } from "../src/lib/manifest";
import type { ProofManifest, SelectedFile, TimestampVerification } from "../src/lib/model";
import { verifyProofPackage, type TimestampVerifier } from "../src/lib/package";

const TSA_PEM = "-----BEGIN CERTIFICATE-----\nsynthetic-tsa\n-----END CERTIFICATE-----\n";
const CA_PEM = "-----BEGIN CERTIFICATE-----\nsynthetic-ca\n-----END CERTIFICATE-----\n";
const REQUEST = new Uint8Array([48, 1, 1]);
const RESPONSE = new Uint8Array([48, 1, 2]);

function selection(name: string, contents: string, type = "text/plain"): SelectedFile {
  return { id: crypto.randomUUID(), file: new File([contents], name, { type }) };
}

function verification(): TimestampVerification {
  return {
    signedTime: new Date("2026-09-15T12:00:00Z"),
    tsaCertificatePem: TSA_PEM,
    caCertificatePem: CA_PEM,
    tsaFingerprint: "a".repeat(64),
    caFingerprint: "b".repeat(64),
    policyOid: "1.2.3.4",
    serialNumberHex: "01",
    revocationChecked: false,
  };
}

async function packageBlob(options: {
  selected?: SelectedFile[];
  mutateManifest?: (manifest: ProofManifest) => void;
  mutateOriginal?: boolean;
  omit?: string;
  extra?: string;
  tsaPem?: string;
  duplicateProofJson?: boolean;
} = {}): Promise<{ blob: Blob; manifestBytes: Uint8Array }> {
  const selected = options.selected ?? [selection("call.m4a", "audio", "audio/mp4")];
  const built = await buildManifest(selected, "support call");
  const manifest = structuredClone(built.manifest);
  options.mutateManifest?.(manifest);
  const manifestBytes = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);

  const writer = new ZipWriter(new BlobWriter("application/zip"));
  for (let index = 0; index < selected.length; index += 1) {
    if (options.omit === manifest.files[index].path) continue;
    const source = options.mutateOriginal && index === 0 ? new Blob(["tampered"]) : selected[index].file;
    await writer.add(manifest.files[index].path, new BlobReader(source), { level: 0 });
  }
  const addBytes = async (path: string, bytes: Uint8Array) => {
    if (options.omit !== path) await writer.add(path, new Uint8ArrayReader(bytes), { level: 0 });
  };
  const addText = async (path: string, text: string) => {
    if (options.omit !== path) await writer.add(path, new TextReader(text), { level: 0 });
  };
  await addBytes("proof/proof.json", manifestBytes);
  if (options.duplicateProofJson) await writer.add("proof/proof.json", new Uint8ArrayReader(manifestBytes), { level: 0 });
  await addBytes("proof/timestamp.tsq", REQUEST);
  await addBytes("proof/timestamp.tsr", RESPONSE);
  await addText("certificates/freetsa-tsa.pem", options.tsaPem ?? TSA_PEM);
  await addText("certificates/freetsa-root.pem", CA_PEM);
  await addText("ProofStamp.txt", "synthetic receipt");
  await addText("VERIFY.txt", "synthetic instructions");
  if (options.extra) await addText(options.extra, "unexpected");
  return { blob: await writer.close(), manifestBytes };
}

function verifier(expectedManifest?: Uint8Array): TimestampVerifier {
  return async (data, request, response) => {
    if (expectedManifest && new TextDecoder().decode(data) !== new TextDecoder().decode(expectedManifest)) throw new Error("manifest timestamp mismatch");
    expect(request).toEqual(REQUEST);
    expect(response).toEqual(RESPONSE);
    return verification();
  };
}

describe("portable ProofStamp package verification", () => {
  it("verifies a mixed set with duplicate names and repeated contents", async () => {
    const selected = [
      selection("chat.png", "same", "image/png"),
      selection("chat.png", "same", "image/png"),
      selection("call.m4a", "audio", "audio/mp4"),
    ];
    const fixture = await packageBlob({ selected });
    const result = await verifyProofPackage(fixture.blob, verifier(fixture.manifestBytes));
    expect(result.status).toBe("verified");
    expect(result.fileCount).toBe(3);
  });

  it("distinguishes altered originals from timestamp failures", async () => {
    const fixture = await packageBlob({ mutateOriginal: true });
    const result = await verifyProofPackage(fixture.blob, verifier(fixture.manifestBytes));
    expect(result.status).toBe("file-mismatch");
  });

  it("reports a valid but altered manifest as an unverifiable timestamp", async () => {
    const original = await packageBlob();
    const altered = await packageBlob({ mutateManifest: (manifest) => { manifest.label = "changed after timestamp"; } });
    const result = await verifyProofPackage(altered.blob, verifier(original.manifestBytes));
    expect(result.status).toBe("timestamp-unverified");
  });

  it("rejects incomplete and unexpected package contents", async () => {
    const missing = await packageBlob({ omit: "proof/timestamp.tsr" });
    expect((await verifyProofPackage(missing.blob, verifier())).status).toBe("package-damaged");

    const extra = await packageBlob({ extra: "surprise.txt" });
    expect((await verifyProofPackage(extra.blob, verifier(extra.manifestBytes))).status).toBe("package-damaged");
  });

  it("rejects a substituted packaged certificate even after timestamp verification", async () => {
    const fixture = await packageBlob({ tsaPem: "-----BEGIN CERTIFICATE-----\nsubstitute\n-----END CERTIFICATE-----\n" });
    const result = await verifyProofPackage(fixture.blob, verifier(fixture.manifestBytes));
    expect(result.status).toBe("package-damaged");
    expect(result.message).toMatch(/certificates do not match/i);
  });

  it("rejects duplicate archive entries", async () => {
    const fixture = await packageBlob({ duplicateProofJson: true });
    const result = await verifyProofPackage(fixture.blob, verifier(fixture.manifestBytes));
    expect(result.status).toBe("package-damaged");
  });
});
