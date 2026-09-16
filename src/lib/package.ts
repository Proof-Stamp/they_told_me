import {
  BlobReader,
  BlobWriter,
  TextReader,
  TextWriter,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter,
} from "@zip.js/zip.js";
import { MAX_ARCHIVE_ENTRIES, MAX_PACKAGE_BYTES } from "./constants";
import { sha256Hex } from "./hash";
import { buildManifest, parseManifest, validateSelection } from "./manifest";
import type { CreatedProof, PackageVerificationResult, ProofManifest, SelectedFile, TimestampVerification } from "./model";
import { throwIfAborted } from "./operation-control";
import { createTimestampEvidence, verifyTimestamp } from "./timestamp";

const PROOF_JSON = "proof/proof.json";
const TSQ = "proof/timestamp.tsq";
const TSR = "proof/timestamp.tsr";
const TSA_CERT = "certificates/freetsa-tsa.pem";
const CA_CERT = "certificates/freetsa-root.pem";
const RECEIPT = "ProofStamp.txt";
const VERIFY = "VERIFY.txt";
const REQUIRED_SUPPORT = [PROOF_JSON, TSQ, TSR, TSA_CERT, CA_CERT, RECEIPT, VERIFY] as const;

type TimestampCreation = Awaited<ReturnType<typeof createTimestampEvidence>>;
type PackageBlobBuilder = (
  selected: SelectedFile[],
  manifest: ProofManifest,
  manifestBytes: Uint8Array,
  timestamp: TimestampCreation,
  signal?: AbortSignal,
) => Promise<Blob>;

export interface CreateProofDependencies {
  buildManifest?: typeof buildManifest;
  createTimestampEvidence?: typeof createTimestampEvidence;
  buildPackageBlob?: PackageBlobBuilder;
}

function readableTime(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "long",
    timeZone: "UTC",
  }).format(date);
}

function receiptText(manifest: ProofManifest, timestamp: TimestampVerification): string {
  const count = manifest.files.length;
  const fileLines = manifest.files.map((file) => `- ${file.originalName} (${file.size} bytes)\n  SHA-256: ${file.sha256}`).join("\n");
  return `They Told Me by ProofStamp\n\nProof created\n${count === 1 ? "This file existed" : `These ${count} files existed`} by ${readableTime(timestamp.signedTime)} UTC.\n\n${manifest.label ? `Label: ${manifest.label}\n\n` : ""}${fileLines}\n\nWhat this proves\nThe exact manifest and listed file bytes existed no later than the signed timestamp.\n\nWhat this does not prove\nIt does not prove when the conversation actually happened, who participated, whether the contents are true or complete, or whether anyone accepted an agreement.\n\nVerification\nOpen this .proofstamp.zip in They Told Me by ProofStamp, or read VERIFY.txt for independent checks.\n`;
}

function verifyInstructions(): string {
  return `They Told Me by ProofStamp — independent verification\n\nThis package contains the original files, a timestamped manifest, the RFC 3161 request/response, and public certificate copies for convenience.\n\nIMPORTANT\nChecking timestamp.tsq + timestamp.tsr alone verifies the timestamp request/response pair. It does NOT verify that the originals match proof/proof.json. Complete verification also hashes proof/proof.json and every listed original.\n\n1. Establish certificate trust independently\n\nDo not trust certificate files merely because they are inside this ZIP. Obtain tsa.crt and cacert.pem independently from FreeTSA at https://www.freetsa.org/index_en.php and compare their SHA-256 file hashes with the values FreeTSA publishes there. Use those independently obtained certificate files for the OpenSSL checks below.\n\n2. Verify the RFC 3161 timestamp with OpenSSL\n\nFrom the extracted package directory, with independently obtained cacert.pem and tsa.crt available:\n\n  openssl ts -verify -in proof/timestamp.tsr -queryfile proof/timestamp.tsq -CAfile cacert.pem -untrusted tsa.crt\n\nExpected result: Verification: OK\n\nThen verify the exact saved manifest bytes:\n\n  openssl ts -verify -in proof/timestamp.tsr -data proof/proof.json -CAfile cacert.pem -untrusted tsa.crt\n\nExpected result: Verification: OK\n\n3. Verify each original\n\nCalculate SHA-256 for every file under original/ and compare it with the exact path and SHA-256 value in proof/proof.json. On common systems:\n\n  sha256sum original/*\n\nOr on macOS:\n\n  shasum -a 256 original/*\n\nBrowser verifier trust policy\n- RFC 3161 response status, SHA-256 message imprint, and request nonce are checked.\n- The CMS timestamp signature and certificate chain are checked.\n- The exact FreeTSA TSA and root certificate DER SHA-256 fingerprints are pinned by the application.\n- Certificate validity is evaluated at the signed timestamp time.\n- The timestamping extended-key-usage is required on the TSA certificate.\n- Revocation is NOT checked by the v1 browser verifier. FreeTSA publishes OCSP/CRL information for online revocation checking.\n\nLimits\nThe proof establishes existence/integrity by the signed time. It does not establish the conversation's actual date, participants, truth, completeness, or agreement. A timestamp obtained today does not prove an earlier date shown inside a screenshot.\n`;
}

async function addBytes(writer: ZipWriter<Blob>, path: string, bytes: Uint8Array, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  await writer.add(path, new Uint8ArrayReader(bytes), { level: 0, useWebWorkers: false });
  throwIfAborted(signal);
}

async function buildPackageBlob(
  selected: SelectedFile[],
  manifest: ProofManifest,
  manifestBytes: Uint8Array,
  timestamp: TimestampCreation,
  signal?: AbortSignal,
): Promise<Blob> {
  throwIfAborted(signal);
  const zipWriter = new ZipWriter(new BlobWriter("application/zip"), { useWebWorkers: false });
  for (let index = 0; index < selected.length; index += 1) {
    throwIfAborted(signal);
    await zipWriter.add(manifest.files[index].path, new BlobReader(selected[index].file), { level: 0, useWebWorkers: false });
    throwIfAborted(signal);
  }
  await addBytes(zipWriter, PROOF_JSON, manifestBytes, signal);
  await addBytes(zipWriter, TSQ, timestamp.request, signal);
  await addBytes(zipWriter, TSR, timestamp.response, signal);
  throwIfAborted(signal);
  await zipWriter.add(TSA_CERT, new TextReader(timestamp.verification.tsaCertificatePem), { level: 0, useWebWorkers: false });
  throwIfAborted(signal);
  await zipWriter.add(CA_CERT, new TextReader(timestamp.verification.caCertificatePem), { level: 0, useWebWorkers: false });
  throwIfAborted(signal);
  await zipWriter.add(RECEIPT, new TextReader(receiptText(manifest, timestamp.verification)), { level: 0, useWebWorkers: false });
  throwIfAborted(signal);
  await zipWriter.add(VERIFY, new TextReader(verifyInstructions()), { level: 0, useWebWorkers: false });
  throwIfAborted(signal);
  const packageBlob = await zipWriter.close();
  throwIfAborted(signal);
  return packageBlob;
}

export async function createProofPackage(
  selected: SelectedFile[],
  label: string,
  signal?: AbortSignal,
  dependencies: CreateProofDependencies = {},
): Promise<CreatedProof & { transport: "direct" | "relay" }> {
  validateSelection(selected);
  throwIfAborted(signal);
  const manifestBuilder = dependencies.buildManifest ?? buildManifest;
  const timestampCreator = dependencies.createTimestampEvidence ?? createTimestampEvidence;
  const packageBuilder = dependencies.buildPackageBlob ?? buildPackageBlob;

  const { manifest, bytes: manifestBytes } = await manifestBuilder(selected, label, signal);
  throwIfAborted(signal);
  const timestamp = await timestampCreator(manifestBytes, signal);
  throwIfAborted(signal);
  const packageBlob = await packageBuilder(selected, manifest, manifestBytes, timestamp, signal);
  throwIfAborted(signal);
  if (packageBlob.size > MAX_PACKAGE_BYTES) throw new Error("The completed proof package exceeds the supported size limit.");

  return {
    manifest,
    manifestBytes,
    timestampRequest: timestamp.request,
    timestampResponse: timestamp.response,
    timestamp: timestamp.verification,
    packageBlob,
    transport: timestamp.transport,
  };
}

type EntryLike = {
  filename: string;
  directory?: boolean;
  uncompressedSize?: number;
  getData?: (writer: unknown, options?: Record<string, unknown>) => Promise<unknown>;
};

async function readBytes(entry: EntryLike): Promise<Uint8Array> {
  if (!entry.getData) throw new Error(`Archive entry ${entry.filename} has no file data.`);
  const value = await entry.getData(new Uint8ArrayWriter(), {
    checkCrc32: true,
    checkOverlappingEntry: true,
    strictness: "strict",
    useWebWorkers: false,
  });
  if (!(value instanceof Uint8Array)) throw new Error(`Could not read ${entry.filename}.`);
  return value;
}

async function readText(entry: EntryLike): Promise<string> {
  if (!entry.getData) throw new Error(`Archive entry ${entry.filename} has no file data.`);
  const value = await entry.getData(new TextWriter(), {
    checkCrc32: true,
    checkOverlappingEntry: true,
    strictness: "strict",
    useWebWorkers: false,
  });
  if (typeof value !== "string") throw new Error(`Could not read ${entry.filename}.`);
  return value;
}

function packageDamaged(message: string, details?: string[]): PackageVerificationResult {
  return { status: "package-damaged", message, details };
}

export type TimestampVerifier = (data: Uint8Array, request: Uint8Array, response: Uint8Array) => Promise<TimestampVerification>;

export async function verifyProofPackage(blob: Blob, timestampVerifier: TimestampVerifier = verifyTimestamp): Promise<PackageVerificationResult> {
  if (blob.size === 0 || blob.size > MAX_PACKAGE_BYTES) return packageDamaged("Package is empty or larger than the supported limit.");

  const reader = new ZipReader(new BlobReader(blob), {
    strictness: "strict",
    checkCrc32: true,
    checkOverlappingEntry: true,
    useWebWorkers: false,
  });

  try {
    const rawEntries = (await reader.getEntries({ strictness: "strict" })) as unknown as EntryLike[];
    const entries = rawEntries.filter((entry) => !entry.directory);
    if (entries.length > MAX_ARCHIVE_ENTRIES) return packageDamaged("Package contains too many entries.");

    const byName = new Map<string, EntryLike>();
    let declaredUncompressed = 0;
    for (const entry of entries) {
      if (!entry.filename || entry.filename.startsWith("/") || entry.filename.includes("\\") || entry.filename.split("/").includes("..")) {
        return packageDamaged("Package contains an unsafe path.");
      }
      if (byName.has(entry.filename)) return packageDamaged("Package contains a duplicate archive entry.");
      byName.set(entry.filename, entry);
      declaredUncompressed += entry.uncompressedSize ?? 0;
      if (declaredUncompressed > MAX_PACKAGE_BYTES) return packageDamaged("Package expands beyond the supported limit.");
    }

    for (const required of REQUIRED_SUPPORT) {
      if (!byName.has(required)) return packageDamaged(`Package is missing ${required}.`);
    }

    let manifestBytes: Uint8Array;
    let requestBytes: Uint8Array;
    let responseBytes: Uint8Array;
    let manifest: ProofManifest;
    try {
      manifestBytes = await readBytes(byName.get(PROOF_JSON)!);
      requestBytes = await readBytes(byName.get(TSQ)!);
      responseBytes = await readBytes(byName.get(TSR)!);
      manifest = parseManifest(manifestBytes);
    } catch (error) {
      return packageDamaged("The proof manifest or timestamp files are damaged.", [error instanceof Error ? error.message : String(error)]);
    }

    const allowed = new Set<string>([...REQUIRED_SUPPORT, ...manifest.files.map((file) => file.path)]);
    for (const name of byName.keys()) {
      if (!allowed.has(name)) return packageDamaged(`Package contains an unexpected file: ${name}`);
    }
    for (const file of manifest.files) {
      if (!byName.has(file.path)) return packageDamaged(`Package is missing an expected original: ${file.originalName}`);
    }

    const mismatches: string[] = [];
    for (const file of manifest.files) {
      let original: Uint8Array;
      try {
        original = await readBytes(byName.get(file.path)!);
      } catch (error) {
        return packageDamaged(`Could not safely read ${file.originalName}.`, [error instanceof Error ? error.message : String(error)]);
      }
      if (original.byteLength !== file.size || (await sha256Hex(original)) !== file.sha256) mismatches.push(file.originalName);
    }
    if (mismatches.length) {
      return {
        status: "file-mismatch",
        message: mismatches.length === 1 ? "File does not match the saved proof." : `${mismatches.length} files do not match the saved proof.`,
        fileCount: manifest.files.length,
        details: mismatches,
      };
    }

    let timestamp: TimestampVerification;
    try {
      timestamp = await timestampVerifier(manifestBytes, requestBytes, responseBytes);
    } catch (error) {
      return {
        status: "timestamp-unverified",
        message: "Timestamp could not be verified.",
        fileCount: manifest.files.length,
        details: [error instanceof Error ? error.message : String(error)],
      };
    }

    try {
      const packagedTsaPem = await readText(byName.get(TSA_CERT)!);
      const packagedCaPem = await readText(byName.get(CA_CERT)!);
      if (packagedTsaPem !== timestamp.tsaCertificatePem || packagedCaPem !== timestamp.caCertificatePem) {
        return packageDamaged("Package certificates do not match the certificates carried by the validated timestamp response.");
      }
    } catch (error) {
      return packageDamaged("Package certificate files are damaged.", [error instanceof Error ? error.message : String(error)]);
    }

    return {
      status: "verified",
      message: manifest.files.length === 1 ? "Verified. The file matches this ProofStamp." : `Verified. All ${manifest.files.length} files match this ProofStamp.`,
      signedTime: timestamp.signedTime,
      fileCount: manifest.files.length,
      details: ["Timestamp signature and pinned FreeTSA certificate trust policy passed.", "Revocation was not checked by the v1 browser verifier."],
    };
  } catch (error) {
    return packageDamaged("Package incomplete or damaged.", [error instanceof Error ? error.message : String(error)]);
  } finally {
    await reader.close().catch(() => undefined);
  }
}
