import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { copyArrayBuffer } from '../lib/bytes';
import { buildManifest } from '../lib/manifest';
import { createProofZip, verifyProofZip } from '../lib/package';
import { createTimestampRequest, FREETSA_URL, verifyTimestamp } from '../lib/timestamp';

const live = process.env.LIVE_RFC3161 === '1' ? describe : describe.skip;

async function stamp(data: Uint8Array): Promise<{ tsq: Uint8Array; tsr: Uint8Array }> {
  const tsq = await createTimestampRequest(data);
  const response = await fetch(FREETSA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/timestamp-query', Accept: 'application/timestamp-reply' },
    body: copyArrayBuffer(tsq),
  });
  expect(response.ok).toBe(true);
  return { tsq, tsr: new Uint8Array(await response.arrayBuffer()) };
}

live('live RFC 3161 path', () => {
  it('verifies a real FreeTSA response and rejects changed data, nonce, and token bytes', async () => {
    const data = new TextEncoder().encode('ProofStamp live browser-verifier fixture');
    const { tsq, tsr } = await stamp(data);
    const verified = await verifyTimestamp(data, tsq, tsr);
    expect(verified.signedTime).toBeInstanceOf(Date);

    const changed = new TextEncoder().encode('ProofStamp live browser-verifier fixture altered');
    await expect(verifyTimestamp(changed, tsq, tsr)).rejects.toThrow('proof manifest');

    const otherRequest = await createTimestampRequest(data);
    await expect(verifyTimestamp(data, otherRequest, tsr)).rejects.toThrow('nonce');

    const forged = tsr.slice();
    forged[forged.length - 1] ^= 1;
    await expect(verifyTimestamp(data, tsq, forged)).rejects.toThrow();
  }, 30_000);

  it('creates and re-verifies a portable package, and distinguishes file and manifest changes', async () => {
    const files = [
      new File(['synthetic audio bytes'], 'support-call.m4a', { type: 'audio/mp4' }),
      new File(['synthetic screenshot bytes'], 'chat.png', { type: 'image/png' }),
    ];
    const { manifest, bytes } = await buildManifest(files, 'Synthetic support case');
    const { tsq, tsr } = await stamp(bytes);
    const timestamp = await verifyTimestamp(bytes, tsq, tsr);
    const proof = await createProofZip(files, manifest, bytes, tsq, tsr, timestamp.signedTime, timestamp.signerPem);

    const result = await verifyProofZip(proof);
    expect(result.fileCount).toBe(2);

    const changedOriginal = await JSZip.loadAsync(proof);
    changedOriginal.file(manifest.files[0].path, 'altered audio bytes', { compression: 'STORE' });
    const changedOriginalBlob = await changedOriginal.generateAsync({ type: 'blob', compression: 'STORE' });
    await expect(verifyProofZip(changedOriginalBlob)).rejects.toThrow('File does not match');

    const changedManifest = await JSZip.loadAsync(proof);
    const alteredManifest = new TextEncoder().encode(new TextDecoder().decode(bytes).replace('Synthetic support case', 'Synthetic changed case'));
    changedManifest.file('proof/proof.json', alteredManifest, { compression: 'STORE' });
    const changedManifestBlob = await changedManifest.generateAsync({ type: 'blob', compression: 'STORE' });
    await expect(verifyProofZip(changedManifestBlob)).rejects.toThrow('Timestamp could not be verified');

    const incomplete = await JSZip.loadAsync(proof);
    incomplete.remove('proof/timestamp.tsr');
    const incompleteBlob = await incomplete.generateAsync({ type: 'blob', compression: 'STORE' });
    await expect(verifyProofZip(incompleteBlob)).rejects.toThrow('Package incomplete or damaged');
  }, 30_000);
});
