import * as pkijs from 'pkijs';

const TSA_URL = 'https://freetsa.org/tsr';
const SHA256_OID = '2.16.840.1.101.3.4.2.1';
const MAX_REQUEST_BYTES = 8 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024;

function validTimestampRequest(body: ArrayBuffer): boolean {
  try {
    const parsed = pkijs.TimeStampReq.fromBER(body);
    return parsed.version === 1
      && parsed.messageImprint.hashAlgorithm.algorithmId === SHA256_OID
      && parsed.messageImprint.hashedMessage.valueBlock.valueHexView.byteLength === 32
      && Boolean(parsed.nonce)
      && parsed.certReq === true
      && !parsed.reqPolicy
      && (!parsed.extensions || parsed.extensions.length === 0);
  } catch {
    return false;
  }
}

export const onRequestPost: PagesFunction = async ({ request }) => {
  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/timestamp-query') return new Response('Unsupported media type', { status: 415 });

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) return new Response('Request too large', { status: 413 });

  const body = await request.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_REQUEST_BYTES) return new Response('Request too large', { status: 413 });
  if (!validTimestampRequest(body)) return new Response('Invalid timestamp request', { status: 400 });

  let upstream: Response;
  try {
    upstream = await fetch(TSA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/timestamp-query', Accept: 'application/timestamp-reply' },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return new Response('Timestamp authority unavailable', { status: 502 });
  }
  if (!upstream.ok) return new Response('Timestamp authority unavailable', { status: 502 });
  const response = await upstream.arrayBuffer();
  if (response.byteLength === 0 || response.byteLength > MAX_RESPONSE_BYTES) return new Response('Invalid timestamp response', { status: 502 });

  return new Response(response, {
    status: 200,
    headers: {
      'Content-Type': 'application/timestamp-reply',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};

export const onRequest: PagesFunction = async () => new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
