import { unzipSync, zipSync } from "fflate";
import type { ProofManifest } from "./manifest";
import { LIMITS } from "./manifest";
import type { TimestampValidation } from "./rfc3161";
import { FREETSA_CA_SHA256, FREETSA_SIGNER_SHA256 } from "./rfc3161";

const enc = new TextEncoder();

export type PackageParts = {
  manifestBytes: Uint8Array;
  tsq: Uint8Array;
  tsr: Uint8Array;
  signerCert: Uint8Array;
};

export function makeReceipt(manifest: ProofManifest, validation: TimestampValidation): string {
  const when = validation.genTime.toISOString();
  return [
    "They Told Me by ProofStamp",
    "",
    manifest.label ? `Label: ${manifest.label}` : null,
    `${manifest.files.length} file${manifest.files.length === 1 ? "" : "s"} existed by: ${when}`,
    "",
    ...manifest.files.map((f) => `${f.order}. ${f.filename} (${f.size} bytes)\n   SHA-256: ${f.sha256}`),
    "",
    "This proof establishes existence and exact-byte integrity by the signed time.",
    "It does not prove the conversation date, participants, truth, completeness, or acceptance.",
    "",
    `Pinned FreeTSA signer SHA-256: ${FREETSA_SIGNER_SHA256}`,
    `Published FreeTSA CA SHA-256: ${FREETSA_CA_SHA256}`,
    ""
  ].filter((v): v is string => v !== null).join("\n");
}

export function makeVerifyInstructions(): string {
  return `They Told Me by ProofStamp — independent verification\n\n1. Obtain FreeTSA certificates independently from https://freetsa.org/ .\n2. Check the published certificate fingerprints before trusting them.\n3. Verify the RFC 3161 request/response pair:\n\n   openssl ts -verify -in proof/timestamp.tsr -queryfile proof/timestamp.tsq -CAfile cacert.pem -untrusted tsa.crt\n\n4. The command above validates the timestamp, but not the original files.\n5. SHA-256 hash proof/proof.json and compare it with the message imprint in the verified timestamp request/token.\n6. SHA-256 hash every file under original/ and compare it with proof/proof.json.\n\nFreeTSA signer SHA-256 pinned by this app:\n${FREETSA_SIGNER_SHA256}\n\nFreeTSA CA SHA-256 published by FreeTSA:\n${FREETSA_CA_SHA256}\n\nThe package includes the signer certificate for convenience. Do not trust it merely because it is inside this ZIP.\n`;
}

export async function buildProofZip(files: File[], manifest: ProofManifest, validation: TimestampValidation, parts: PackageParts): Promise<Uint8Array> {
  const entries: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
  for (let i = 0; i < files.length; i++) entries[manifest.files[i].path] = [new Uint8Array(await files[i].arrayBuffer()), { level: 0 }];
  entries["proof/proof.json"] = [parts.manifestBytes, { level: 0 }];
  entries["proof/timestamp.tsq"] = [parts.tsq, { level: 0 }];
  entries["proof/timestamp.tsr"] = [parts.tsr, { level: 0 }];
  entries["certificates/freetsa-signer.cer"] = [parts.signerCert, { level: 0 }];
  entries["ProofStamp.txt"] = [enc.encode(makeReceipt(manifest, validation)), { level: 0 }];
  entries["VERIFY.txt"] = [enc.encode(makeVerifyInstructions()), { level: 0 }];
  return zipSync(entries, { level: 0 });
}

function unsafePath(path: string): boolean {
  return path.startsWith("/") || path.includes("\\") || path.split("/").some((p) => p === ".." || p === "");
}

export function inspectStoredZip(bytes: Uint8Array): string[] {
  if (bytes.byteLength > LIMITS.maxPackageBytes) throw new Error("The ProofStamp package is larger than the supported limit.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const min = Math.max(0, bytes.length - 65557);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= min; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("The ZIP end record is missing.");
  const count = view.getUint16(eocd + 10, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (count < 1 || count > LIMITS.maxFiles + 8) throw new Error("The ZIP contains an unexpected number of entries.");
  const decoder = new TextDecoder();
  const names: string[] = [];
  const seen = new Set<string>();
  let offset = centralOffset;
  for (let n = 0; n < count; n++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) throw new Error("The ZIP central directory is invalid.");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLen));
    if (method !== 0 || compressedSize !== uncompressedSize) throw new Error("Compressed ZIP entries are not supported in ProofStamp packages.");
    if (uncompressedSize > LIMITS.maxFileBytes && !["proof/timestamp.tsr", "proof/timestamp.tsq"].includes(name)) throw new Error("A ZIP entry exceeds the supported size limit.");
    if (unsafePath(name) || seen.has(name)) throw new Error("The ZIP contains an unsafe or duplicate path.");
    seen.add(name); names.push(name);
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

export function unzipProof(bytes: Uint8Array): Record<string, Uint8Array> {
  const names = inspectStoredZip(bytes);
  const entries = unzipSync(bytes);
  const allowedFixed = new Set(["proof/proof.json", "proof/timestamp.tsq", "proof/timestamp.tsr", "certificates/freetsa-signer.cer", "ProofStamp.txt", "VERIFY.txt"]);
  for (const name of names) {
    if (!name.startsWith("original/") && !allowedFixed.has(name)) throw new Error(`Unexpected package entry: ${name}`);
  }
  return entries;
}
