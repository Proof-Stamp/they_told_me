import JSZip from 'jszip';
import { sha256, toHex } from './bytes';
import type { ProofManifest } from './manifest';
import { MANIFEST_VERSION, MAX_FILES, MAX_TOTAL_BYTES } from './manifest';
import { verifyTimestamp } from './timestamp';

export interface VerifyResult {
  signedTime: Date;
  fileCount: number;
  label?: string;
}

function isSafePath(path: string): boolean {
  return !path.startsWith('/') && !path.includes('\\') && path.split('/').every((part) => part !== '..' && part !== '');
}

async function centralDirectoryPaths(blob: Blob): Promise<string[]> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdMin = 22;
  const searchStart = Math.max(0, bytes.length - eocdMin - 0xffff);
  let eocd = -1;
  for (let offset = bytes.length - eocdMin; offset >= searchStart; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error('Package incomplete or damaged.');

  const entryCount = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error('Package format is not supported.');
  }
  if (centralOffset + centralSize > bytes.length) throw new Error('Package incomplete or damaged.');

  const decoder = new TextDecoder('utf-8', { fatal: false });
  const paths: string[] = [];
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('Package incomplete or damaged.');
    }
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > bytes.length) throw new Error('Package incomplete or damaged.');
    paths.push(decoder.decode(bytes.subarray(nameStart, nameEnd)));
    offset = nameEnd + extraLength + commentLength;
  }
  return paths;
}

export async function createProofZip(
  files: File[],
  manifest: ProofManifest,
  manifestBytes: Uint8Array,
  tsq: Uint8Array,
  tsr: Uint8Array,
  signedTime: Date,
  signerPem: string,
): Promise<Blob> {
  const zip = new JSZip();
  for (let i = 0; i < files.length; i += 1) {
    zip.file(manifest.files[i].path, await files[i].arrayBuffer(), { compression: 'STORE' });
  }
  zip.file('proof/proof.json', manifestBytes, { compression: 'STORE' });
  zip.file('proof/timestamp.tsq', tsq, { compression: 'STORE' });
  zip.file('proof/timestamp.tsr', tsr, { compression: 'STORE' });
  zip.file('certificates/freetsa-tsa.crt', signerPem, { compression: 'STORE' });
  zip.file('ProofStamp.txt', receiptText(manifest, signedTime), { compression: 'STORE' });
  zip.file('VERIFY.txt', verifyText(), { compression: 'STORE' });
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

function receiptText(manifest: ProofManifest, signedTime: Date): string {
  return `They Told Me by ProofStamp\n\nFiles: ${manifest.files.length}\n${manifest.label ? `Label: ${manifest.label}\n` : ''}Existence established by: ${signedTime.toISOString()}\n\nThis package proves that the exact manifest bytes were timestamped and that the listed original files match that manifest. It does not prove the conversation date, participants, truth, completeness, or acceptance of an agreement.\n`;
}

function verifyText(): string {
  return `Independent verification\n\n1. Keep proof/proof.json, proof/timestamp.tsq and proof/timestamp.tsr unchanged.\n2. Obtain the current FreeTSA CA certificate independently from https://www.freetsa.org/files/cacert.pem. Do not trust a certificate only because it is inside this ZIP.\n3. Verify the RFC 3161 response with OpenSSL:\n   openssl ts -verify -in proof/timestamp.tsr -queryfile proof/timestamp.tsq -CAfile cacert.pem -untrusted certificates/freetsa-tsa.crt\n4. SHA-256 hash each original file and compare it with proof/proof.json.\n\nThe .tsq/.tsr check alone does not verify the original files. Complete verification also checks the exact manifest bytes and every listed original.\n`;
}

export async function verifyProofZip(blob: Blob): Promise<VerifyResult> {
  if (blob.size > MAX_TOTAL_BYTES + 5 * 1024 * 1024) throw new Error('Package exceeds the supported size limit.');
  const rawPaths = await centralDirectoryPaths(blob);
  if (new Set(rawPaths).size !== rawPaths.length) throw new Error('Package contains duplicate archive entries.');
  const zip = await JSZip.loadAsync(blob, { createFolders: false, checkCRC32: true });
  const paths = Object.keys(zip.files);
  if (paths.length > MAX_FILES + 10) throw new Error('Package contains too many entries.');
  if (paths.some((path) => !isSafePath(path))) throw new Error('Package contains an unsafe path.');

  for (const path of ['proof/proof.json', 'proof/timestamp.tsq', 'proof/timestamp.tsr']) {
    if (!zip.file(path)) throw new Error('Package incomplete or damaged.');
  }

  const manifestBytes = await zip.file('proof/proof.json')!.async('uint8array');
  let manifest: ProofManifest;
  try { manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as ProofManifest; }
  catch { throw new Error('Package incomplete or damaged.'); }
  if (manifest.format !== MANIFEST_VERSION || !Array.isArray(manifest.files) || manifest.files.length < 1 || manifest.files.length > MAX_FILES) {
    throw new Error('Package format is not supported.');
  }

  const expectedOriginals = new Set(manifest.files.map((item) => item.path));
  const actualOriginals = paths.filter((path) => path.startsWith('original/') && !zip.files[path].dir);
  if (actualOriginals.length !== expectedOriginals.size || actualOriginals.some((path) => !expectedOriginals.has(path))) {
    throw new Error('Package incomplete or damaged.');
  }

  for (const item of manifest.files) {
    if (!isSafePath(item.path) || !item.path.startsWith('original/')) throw new Error('Package contains an unsafe path.');
    const entry = zip.file(item.path);
    if (!entry) throw new Error('Package incomplete or damaged.');
    const bytes = await entry.async('uint8array');
    if (bytes.byteLength !== item.size || toHex(await sha256(bytes)) !== item.sha256) {
      throw new Error(`File does not match: ${item.name}`);
    }
  }

  const tsq = await zip.file('proof/timestamp.tsq')!.async('uint8array');
  const tsr = await zip.file('proof/timestamp.tsr')!.async('uint8array');
  let timestamp;
  try { timestamp = await verifyTimestamp(manifestBytes, tsq, tsr); }
  catch (error) { throw new Error(`Timestamp could not be verified: ${error instanceof Error ? error.message : 'unknown error'}`); }
  return { signedTime: timestamp.signedTime, fileCount: manifest.files.length, label: manifest.label };
}
