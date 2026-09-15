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

function upstreamErrorDetail(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown fetch error.";
  const detail = `${error.name}: ${error.message}`.replace(/[\r\n]+/g, " ").slice(0, 240);
  return detail || "Unknown fetch error.";
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const contentType = context.request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/timestamp-query") return plain("Expected application/timestamp-query.", 415);

  const declaredLength = Number(context.request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_REQUEST_BYTES) return plain("Timestamp request is too large.", 413);

  const body = new Uint8Array(await context.request.arrayBuffer());
  if (body.length === 0 || body.length > MAX_REQUEST_BYTES) return plain("Invalid timestamp request size.", body.length ? 413 : 400);

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
      redirect: "error",
      signal: controller.signal,
    });
    if (!upstream.ok) return plain(`Timestamp authority returned HTTP ${upstream.status}.`, 502);
    const responseBody = await upstream.arrayBuffer();
    if (responseBody.byteLength === 0 || responseBody.byteLength > MAX_RESPONSE_BYTES) {
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
  } catch (error) {
    return plain(`Timestamp authority is unavailable. Diagnostic: ${upstreamErrorDetail(error)}`, 502);
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
