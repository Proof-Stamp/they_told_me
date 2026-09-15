const FREETSA_URL = "https://freetsa.org/tsr";
const MAX_TS_REQUEST_BYTES = 16 * 1024;
const MAX_TS_RESPONSE_BYTES = 256 * 1024;

export const onRequest: PagesFunction = async ({ request }) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/timestamp-query") return new Response("Unsupported content type", { status: 415 });

  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > MAX_TS_REQUEST_BYTES) return new Response("Request too large", { status: 413 });

  const body = await request.arrayBuffer();
  if (body.byteLength < 8 || body.byteLength > MAX_TS_REQUEST_BYTES) return new Response("Invalid request size", { status: 400 });

  let upstream: Response;
  try {
    upstream = await fetch(FREETSA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/timestamp-query",
        Accept: "application/timestamp-reply",
        "User-Agent": "ProofStamp-They-Told-Me/0.1"
      },
      body
    });
  } catch {
    return new Response("Timestamp provider unavailable", { status: 502 });
  }

  if (!upstream.ok) return new Response("Timestamp provider unavailable", { status: 502 });
  const type = upstream.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/timestamp-reply")) return new Response("Unexpected timestamp provider response", { status: 502 });

  const responseBody = await upstream.arrayBuffer();
  if (responseBody.byteLength < 8 || responseBody.byteLength > MAX_TS_RESPONSE_BYTES) return new Response("Invalid timestamp provider response", { status: 502 });

  return new Response(responseBody, {
    status: 200,
    headers: {
      "Content-Type": "application/timestamp-reply",
      "Cache-Control": "no-store"
    }
  });
};
