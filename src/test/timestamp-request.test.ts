import { describe, expect, it } from 'vitest';
import * as pkijs from 'pkijs';
import { createTimestampRequest, SHA256_OID } from '../lib/timestamp';

describe('RFC 3161 request', () => {
  it('uses SHA-256, a nonce, and requests the signer certificate', async () => {
    const data = new TextEncoder().encode('synthetic proof fixture');
    const bytes = await createTimestampRequest(data);
    const request = pkijs.TimeStampReq.fromBER(bytes.slice().buffer);
    expect(request.messageImprint.hashAlgorithm.algorithmId).toBe(SHA256_OID);
    expect(request.nonce).toBeDefined();
    expect(request.certReq).toBe(true);
  });
});
