import { sha256, toHex } from './bytes';

export const MANIFEST_VERSION = 'proofstamp-package-v1' as const;
export const MAX_FILES = 12;
export const MAX_FILE_BYTES = 75 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 250 * 1024 * 1024;

export interface ManifestFile {
  path: string;
  name: string;
  size: number;
  sha256: string;
  order: number;
}

export interface ProofManifest {
  format: typeof MANIFEST_VERSION;
  label?: string;
  files: ManifestFile[];
}

function safeLeafName(name: string): string {
  const stripped = name.replace(/[\\/\0-\x1f\x7f]+/g, '_').replace(/^\.+/, '').trim();
  return stripped || 'file';
}

export function validateSelection(files: File[]): void {
  if (files.length === 0) throw new Error('Choose at least one file.');
  if (files.length > MAX_FILES) throw new Error(`Choose no more than ${MAX_FILES} files.`);
  let total = 0;
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} exceeds the per-file limit.`);
    total += file.size;
  }
  if (total > MAX_TOTAL_BYTES) throw new Error('The selected files exceed the total size limit.');
}

export async function buildManifest(files: File[], label: string): Promise<{ manifest: ProofManifest; bytes: Uint8Array }> {
  validateSelection(files);
  const entries: ManifestFile[] = [];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const digest = await sha256(await file.arrayBuffer());
    entries.push({
      path: `original/${String(i + 1).padStart(3, '0')}-${safeLeafName(file.name)}`,
      name: file.name,
      size: file.size,
      sha256: toHex(digest),
      order: i + 1,
    });
  }
  const manifest: ProofManifest = {
    format: MANIFEST_VERSION,
    ...(label.trim() ? { label: label.trim() } : {}),
    files: entries,
  };
  const bytes = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, bytes };
}
