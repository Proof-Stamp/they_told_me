import { describe, expect, it } from 'vitest';
import { onRequest, onRequestPost } from '../../functions/api/timestamp';

describe('timestamp relay boundaries', () => {
  it('rejects non-POST access', async () => {
    const response = await onRequest({ request: new Request('https://example.test/api/timestamp') } as never);
    expect(response.status).toBe(405);
  });

  it('rejects the wrong media type without forwarding anything', async () => {
    const response = await onRequestPost({
      request: new Request('https://example.test/api/timestamp', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: 'file bytes' }),
    } as never);
    expect(response.status).toBe(415);
  });

  it('rejects bytes that are not a valid bounded RFC 3161 request', async () => {
    const response = await onRequestPost({
      request: new Request('https://example.test/api/timestamp', { method: 'POST', headers: { 'Content-Type': 'application/timestamp-query' }, body: 'not an RFC3161 request' }),
    } as never);
    expect(response.status).toBe(400);
  });
});
