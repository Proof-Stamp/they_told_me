const FREETSA_URL = "https://freetsa.org/tsr";
const MAX_REQUEST_BYTES = 8192;
const MAX_RESPONSE_BYTES = 64 * 1024;
const TIMEOUT_MS = 15_000;

type PagesContext = { request: Request };

function plain(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function declaredLengthTooLarge(headers: Headers, maximum: number): boolean {
  const raw = headers.get("content-length");
  if (raw === null) return false;
  const value = Number(raw);
  return Number.isFinite(value) && value > maximum;
}

async function readBounded(stream: ReadableStream<Uint8Array> | null, maximum: number): Promise<Uint8Array | null> {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      total += value.byteLength;
      if (total > maximum) {
        await reader.cancel("body exceeds configured limit").catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const contentType = context.request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/timestamp-query") return plain("Expected application/timestamp-query.", 415);

  if (declaredLengthTooLarge(context.request.headers, MAX_REQUEST_BYTES)) return plain("Timestamp request is too large.", 413);

  const body = await readBounded(context.request.body, MAX_REQUEST_BYTES);
  if (body === null) return plain("Invalid timestamp request size.", 413);
  if (body.length === 0) return plain("Invalid timestamp request size.", 400);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetch(FREETSA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/timestamp-query",
        Accept: "application/timestamp-reply, application/octet-stream",
      },
      body,
      redirect: "manual",
      signal: controller.signal,
    });
    if (!upstream.ok) return plain(`Timestamp authority returned HTTP ${upstream.status}.`, 502);
    if (declaredLengthTooLarge(upstream.headers, MAX_RESPONSE_BYTES)) {
      await upstream.body?.cancel("response exceeds configured limit").catch(() => undefined);
      return plain("Timestamp authority returned an invalid response size.", 502);
    }
    const responseBody = await readBounded(upstream.body, MAX_RESPONSE_BYTES);
    if (responseBody === null || responseBody.byteLength === 0) {
      return plain("Timestamp authority returned an invalid response size.", 502);
    }
    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/timestamp-reply",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return plain("Timestamp authority is unavailable.", 502);
  } finally {
    clearTimeout(timer);
  }
}

export function onRequest(context: PagesContext): Response | Promise<Response> {
  if (context.request.method !== "POST") {
    return new Response("Method not allowed.", { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
  }
  return onRequestPost(context);
}
