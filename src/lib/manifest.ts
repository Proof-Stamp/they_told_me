import { sha256, toHex } from "./bytes";

export const LIMITS = {
  maxFiles: 12,
  maxFileBytes: 50 * 1024 * 1024,
  maxTotalBytes: 150 * 1024 * 1024,
  maxPackageBytes: 175 * 1024 * 1024
} as const;

export type ProofFileRecord = {
  path: string;
  filename: string;
  size: number;
  sha256: string;
  order: number;
};

export type ProofManifest = {
  format: "proofstamp.collection";
  version: 1;
  label?: string;
  files: ProofFileRecord[];
};

function safeBasename(name: string): string {
  const normalized = name.replace(/[\\/\u0000-\u001f\u007f]+/g, "_").replace(/^\.+/, "").trim();
  return (normalized || "file").slice(0, 180);
}

export function assertSelection(files: File[]): void {
  if (files.length < 1) throw new Error("Choose at least one file.");
  if (files.length > LIMITS.maxFiles) throw new Error(`Choose no more than ${LIMITS.maxFiles} files.`);
  let total = 0;
  for (const file of files) {
    if (file.size > LIMITS.maxFileBytes) throw new Error(`${file.name} is larger than the per-file limit.`);
    total += file.size;
  }
  if (total > LIMITS.maxTotalBytes) throw new Error("The selected files are larger than the total size limit.");
}

export async function buildManifest(files: File[], label: string): Promise<{ manifest: ProofManifest; bytes: Uint8Array }> {
  assertSelection(files);
  const records: ProofFileRecord[] = [];
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const digest = await sha256(await file.arrayBuffer());
    records.push({
      path: `original/${String(index + 1).padStart(3, "0")}-${safeBasename(file.name)}`,
      filename: file.name,
      size: file.size,
      sha256: toHex(digest),
      order: index + 1
    });
  }
  const cleanLabel = label.trim().slice(0, 120);
  const manifest: ProofManifest = {
    format: "proofstamp.collection",
    version: 1,
    ...(cleanLabel ? { label: cleanLabel } : {}),
    files: records
  };
  const bytes = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, bytes };
}

export function parseManifest(bytes: Uint8Array): ProofManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("The proof manifest is not valid UTF-8 JSON.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("The proof manifest is invalid.");
  const m = parsed as Partial<ProofManifest>;
  if (m.format !== "proofstamp.collection" || m.version !== 1 || !Array.isArray(m.files)) {
    throw new Error("This ProofStamp package format is not supported.");
  }
  if (m.files.length < 1 || m.files.length > LIMITS.maxFiles) throw new Error("The proof manifest has an invalid file count.");
  const seenPaths = new Set<string>();
  let total = 0;
  for (const [index, rec] of m.files.entries()) {
    if (!rec || typeof rec !== "object") throw new Error("The proof manifest has an invalid file entry.");
    if (rec.order !== index + 1) throw new Error("The proof manifest file order is invalid.");
    if (typeof rec.path !== "string" || !/^original\/[0-9]{3}-[^/]+$/.test(rec.path) || seenPaths.has(rec.path)) {
      throw new Error("The proof manifest contains an unsafe or duplicate path.");
    }
    seenPaths.add(rec.path);
    if (typeof rec.filename !== "string" || rec.filename.length < 1) throw new Error("The proof manifest is missing a filename.");
    if (!Number.isSafeInteger(rec.size) || rec.size < 0 || rec.size > LIMITS.maxFileBytes) throw new Error("The proof manifest contains an invalid file size.");
    if (typeof rec.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(rec.sha256)) throw new Error("The proof manifest contains an invalid SHA-256 value.");
    total += rec.size;
  }
  if (total > LIMITS.maxTotalBytes) throw new Error("The proof manifest exceeds the total size limit.");
  return m as ProofManifest;
}
