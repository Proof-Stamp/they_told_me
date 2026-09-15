import { sha256, toHex } from "./bytes";
import { buildManifest, parseManifest, type ProofManifest } from "./manifest";
import { buildProofZip, unzipProof } from "./zip";
import { createTimestampRequest, parseTimestampRequest, requestTimestamp, validateTimestampResponse, type TimestampValidation } from "./rfc3161";

export type CreatedProof = {
  zip: Uint8Array;
  manifest: ProofManifest;
  validation: TimestampValidation;
  transport: "direct" | "relay";
};

export async function createProof(files: File[], label: string, signal?: AbortSignal): Promise<CreatedProof> {
  const { manifest, bytes: manifestBytes } = await buildManifest(files, label);
  const digest = await sha256(manifestBytes);
  const { bytes: tsq } = createTimestampRequest(digest);
  const { tsr, transport } = await requestTimestamp(tsq, signal);
  const validation = await validateTimestampResponse(tsr, tsq);
  const zip = await buildProofZip(files, manifest, validation, {
    manifestBytes,
    tsq,
    tsr,
    signerCert: validation.signerCertificateDer
  });
  return { zip, manifest, validation, transport };
}

export type VerifyResult = {
  manifest: ProofManifest;
  validation: TimestampValidation;
};

export async function verifyProofPackage(packageBytes: Uint8Array): Promise<VerifyResult> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipProof(packageBytes);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The ZIP could not be read.";
    throw new Error(`Package incomplete or damaged: ${detail}`);
  }

  const required = [
    "proof/proof.json",
    "proof/timestamp.tsq",
    "proof/timestamp.tsr",
    "certificates/freetsa-signer.cer",
    "ProofStamp.txt",
    "VERIFY.txt"
  ];
  for (const name of required) {
    if (!entries[name]) throw new Error(`Package incomplete or damaged: ${name} is missing.`);
  }

  const manifestBytes = entries["proof/proof.json"];
  let manifest: ProofManifest;
  try {
    manifest = parseManifest(manifestBytes);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The manifest could not be read.";
    throw new Error(`Package incomplete or damaged: ${detail}`);
  }

  const expectedOriginals = new Set(manifest.files.map((f) => f.path));
  const actualOriginals = Object.keys(entries).filter((name) => name.startsWith("original/"));
  if (actualOriginals.length !== expectedOriginals.size || actualOriginals.some((name) => !expectedOriginals.has(name))) {
    throw new Error("Package incomplete or damaged: original files do not match the manifest.");
  }

  for (const record of manifest.files) {
    const bytes = entries[record.path];
    if (!bytes || bytes.byteLength !== record.size) throw new Error(`File does not match: ${record.filename}`);
    const actual = toHex(await sha256(bytes));
    if (actual !== record.sha256) throw new Error(`File does not match: ${record.filename}`);
  }

  const request = entries["proof/timestamp.tsq"];
  let requestDigest: Uint8Array;
  try {
    requestDigest = parseTimestampRequest(request).digest;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The timestamp request is invalid.";
    throw new Error(`Package incomplete or damaged: ${detail}`);
  }

  const manifestDigest = await sha256(manifestBytes);
  if (toHex(requestDigest) !== toHex(manifestDigest)) {
    throw new Error("Package incomplete or damaged: the manifest is not the timestamped manifest.");
  }

  let validation: TimestampValidation;
  try {
    validation = await validateTimestampResponse(entries["proof/timestamp.tsr"], request);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The timestamp response is invalid.";
    throw new Error(`Timestamp could not be verified: ${detail}`);
  }

  const includedSigner = entries["certificates/freetsa-signer.cer"];
  if (toHex(await sha256(includedSigner)) !== validation.signerFingerprint) {
    throw new Error("Package incomplete or damaged: the bundled signer certificate was substituted.");
  }

  return { manifest, validation };
}

export function packageName(label: string): string {
  const base = label.trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "they-told-me";
  return `${base}.proofstamp.zip`;
}
