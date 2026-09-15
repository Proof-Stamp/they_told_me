const TSA_URL = 'https://freetsa.org/tsr';
const MAX_REQUEST_BYTES = 8 * 1024;

export const onRequestPost: PagesFunction = async ({ request }) => {
  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/timestamp-query') return new Response('Unsupported media type', { status: 415 });
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_REQUEST_BYTES) return new Response('Request too large', { status: 413 });
  const body = await request.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_REQUEST_BYTES) return new Response('Request too large', { status: 413 });

  const upstream = await fetch(TSA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/timestamp-query', Accept: 'application/timestamp-reply' },
    body,
    redirect: 'error',
  });
  if (!upstream.ok) return new Response('Timestamp authority unavailable', { status: 502 });
  const response = await upstream.arrayBuffer();
  if (response.byteLength > 64 * 1024) return new Response('Invalid timestamp response', { status: 502 });
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
