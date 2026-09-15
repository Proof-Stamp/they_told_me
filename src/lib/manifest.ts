import { HASH_ALGORITHM, MANIFEST_VERSION, MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_BYTES, PRODUCT_NAME } from "./constants";
import { sha256File } from "./hash";
import type { ManifestFile, ProofManifest, SelectedFile } from "./model";

const encoder = new TextEncoder();
const SAFE_NAME_RE = /[^A-Za-z0-9._ -]+/g;

export function safeInternalName(name: string): string {
  const normalized = name.normalize("NFKC").replace(/[\\/]/g, "_").replace(SAFE_NAME_RE, "_").trim();
  const compact = normalized.replace(/\s+/g, " ").slice(0, 120);
  return compact || "file";
}

export function internalPath(order: number, originalName: string): string {
  return `original/${String(order).padStart(4, "0")}--${safeInternalName(originalName)}`;
}

export function validateSelection(selected: SelectedFile[]): void {
  if (selected.length === 0) throw new Error("Choose at least one file.");
  if (selected.length > MAX_FILES) throw new Error(`Choose no more than ${MAX_FILES} files.`);

  let total = 0;
  for (const item of selected) {
    if (item.file.size > MAX_FILE_BYTES) {
      throw new Error(`${item.file.name} is larger than the per-file limit.`);
    }
    total += item.file.size;
  }
  if (total > MAX_TOTAL_BYTES) throw new Error("The selected files are larger than the total size limit.");
}

export async function buildManifest(selected: SelectedFile[], label: string): Promise<{ manifest: ProofManifest; bytes: Uint8Array }> {
  validateSelection(selected);
  const files: ManifestFile[] = [];

  for (let index = 0; index < selected.length; index += 1) {
    const file = selected[index].file;
    files.push({
      order: index + 1,
      path: internalPath(index + 1, file.name),
      originalName: file.name,
      size: file.size,
      mediaType: file.type || "application/octet-stream",
      sha256: await sha256File(file),
    });
  }

  const trimmedLabel = label.trim().slice(0, 120);
  const manifest: ProofManifest = {
    version: MANIFEST_VERSION,
    product: PRODUCT_NAME,
    hashAlgorithm: HASH_ALGORITHM,
    ...(trimmedLabel ? { label: trimmedLabel } : {}),
    files,
  };
  const bytes = encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, bytes };
}

export function parseManifest(bytes: Uint8Array): ProofManifest {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object") throw new Error("Manifest is not an object.");
  const manifest = value as Partial<ProofManifest>;
  if (manifest.version !== MANIFEST_VERSION || manifest.product !== PRODUCT_NAME || manifest.hashAlgorithm !== HASH_ALGORITHM) {
    throw new Error("Unsupported ProofStamp manifest.");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0 || manifest.files.length > MAX_FILES) {
    throw new Error("Manifest file list is invalid.");
  }
  const paths = new Set<string>();
  const orders = new Set<number>();
  let total = 0;
  for (const file of manifest.files) {
    if (!file || typeof file !== "object") throw new Error("Manifest file entry is invalid.");
    if (!Number.isInteger(file.order) || file.order < 1) throw new Error("Manifest order is invalid.");
    if (orders.has(file.order)) throw new Error("Manifest contains a duplicate selection order.");
    orders.add(file.order);
    if (typeof file.path !== "string" || !/^original\/[0-9]{4}--[^/]+$/.test(file.path)) throw new Error("Manifest path is unsafe.");
    if (paths.has(file.path)) throw new Error("Manifest contains a duplicate path.");
    paths.add(file.path);
    if (typeof file.originalName !== "string" || file.originalName.length === 0) throw new Error("Manifest filename is invalid.");
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_FILE_BYTES) throw new Error("Manifest file size is invalid.");
    if (!/^[0-9a-f]{64}$/.test(file.sha256)) throw new Error("Manifest SHA-256 is invalid.");
    total += file.size;
  }
  if (total > MAX_TOTAL_BYTES) throw new Error("Manifest total size exceeds the supported limit.");
  return manifest as ProofManifest;
}
