type ProxyConfig = {
  appOrigin: string;
  goApiUrl: string;
  fetch?: typeof fetch;
  timeouts?: { bodyMs?: number; upstreamMs?: number; totalMs?: number; readMs?: number };
};

const JSON_LIMIT = 16 * 1024;
const MULTIPART_LIMIT = 1024 * 1024 + JSON_LIMIT;
const RESPONSE_LIMIT = 4 * 1024 * 1024;
const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const READ_PATH = new RegExp(`^/v1/catalog/(?:samples|runs/${UUID}(?:/export)?)$`);
const ERROR_STATUSES = new Set([400, 403, 404, 409, 413, 415, 422, 429, 499, 500, 503, 504]);
const SAFE_HEADERS = { "cache-control": "no-store", "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "no-referrer" };

class TransportError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

export function transportError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message, details: [], details_truncated: false } }, { status, headers: SAFE_HEADERS });
}

function configuredOrigin(value: string): URL {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("A configured service origin must be an HTTP(S) origin without credentials or a path.");
  }
  return url;
}

async function boundedBytes(body: ReadableStream<Uint8Array> | null, limit: number, signal: AbortSignal, upstream = false): Promise<Uint8Array> {
  signal.throwIfAborted();
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let onAbort = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => {
      void reader.cancel(signal.reason).catch(() => {});
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        void reader.cancel().catch(() => {});
        throw upstream
          ? new TransportError(503, "service_unavailable", "The catalog response exceeded its supported size.")
          : new TransportError(413, "input_limit", "The request exceeds the supported input size.");
      }
      chunks.push(value);
    }
    signal.throwIfAborted();
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

// One instance is shared by every catalog route in this Node process.
export function createCatalogProxy(config: ProxyConfig) {
  const appOrigin = configuredOrigin(config.appOrigin).origin;
  const goOrigin = configuredOrigin(config.goApiUrl).origin;
  const call = config.fetch ?? fetch;
  const timeouts = { bodyMs: 10_000, upstreamMs: 35_000, totalMs: 45_000, readMs: 5_000, ...config.timeouts };
  let posts = 0;
  let reads = 0;

  return async (request: Request, path: string): Promise<Response> => {
    const isPost = request.method === "POST";
    if ((isPost && path !== "/v1/catalog/runs") || (!isPost && (request.method !== "GET" || !READ_PATH.test(path)))) {
      return transportError(404, "run_not_found", "The requested catalog resource was not found.");
    }
    const origin = request.headers.get("origin");
    if ((isPost && (origin !== appOrigin || request.headers.get("x-catalog-request") !== "1")) ||
        (!isPost && ((origin !== null && origin !== appOrigin) || request.headers.get("sec-fetch-site") === "cross-site"))) {
      return transportError(403, "request_forbidden", "Use this application's catalog form.");
    }
    if ((isPost && posts >= 2) || (!isPost && reads >= 4)) {
      return transportError(429, "capacity_exceeded", "The catalog is busy. Make a new attempt shortly.");
    }
    if (isPost) posts++; else reads++;

    const controller = new AbortController();
    const timeout = () => controller.abort(new TransportError(504, "deadline_exceeded", "The catalog request timed out. A new attempt is required."));
    const onCancel = () => controller.abort(new TransportError(499, "request_cancelled", "The catalog request was cancelled."));
    request.signal.addEventListener("abort", onCancel, { once: true });
    if (request.signal.aborted) onCancel();
    const totalTimer = setTimeout(timeout, isPost ? timeouts.totalMs : timeouts.readMs);
    let stageTimer: ReturnType<typeof setTimeout> | undefined;
    let upstream: Response | undefined;
    try {
      controller.signal.throwIfAborted();
      let body: Uint8Array | undefined;
      const forwardHeaders = new Headers({ accept: path.endsWith("/export") ? "text/csv, application/json" : "application/json" });
      if (isPost) {
        const contentType = request.headers.get("content-type") ?? "";
        const json = /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType);
        const multipart = /^multipart\/form-data\s*;\s*boundary=(?:[A-Za-z0-9'()+_,./:=?-]{1,70}|"[A-Za-z0-9'()+_,./:=? -]{1,70}")$/i.test(contentType);
        if (!json && !multipart) throw new TransportError(415, "unsupported_media_type", "Use JSON sample input or a CSV file upload.");
        const limit = json ? JSON_LIMIT : MULTIPART_LIMIT;
        const declared = request.headers.get("content-length");
        if (declared !== null && !/^\d+$/.test(declared)) throw new TransportError(400, "invalid_request", "The request length is invalid.");
        if (declared !== null && Number(declared) > limit) throw new TransportError(413, "input_limit", "The request exceeds the supported input size.");
        stageTimer = setTimeout(timeout, timeouts.bodyMs);
        body = await boundedBytes(request.body, limit, controller.signal);
        clearTimeout(stageTimer);
        stageTimer = undefined;
        forwardHeaders.set("content-type", contentType);
      }
      stageTimer = setTimeout(timeout, isPost ? timeouts.upstreamMs : timeouts.readMs);
      upstream = await call(new URL(path, goOrigin), {
        method: request.method, headers: forwardHeaders,
        body: body as BodyInit | undefined,
        signal: controller.signal, redirect: "manual", cache: "no-store", credentials: "omit",
      });
      const csv = path.endsWith("/export") && upstream.status === 200;
      const contentType = upstream.headers.get("content-type") ?? "";
      const successStatus = isPost ? 201 : 200;
      if ((upstream.status !== successStatus && !ERROR_STATUSES.has(upstream.status)) ||
          !(csv ? /^text\/csv(?:;|$)/i.test(contentType) : /^application\/json(?:;|$)/i.test(contentType))) {
        void upstream.body?.cancel().catch(() => {});
        throw new TransportError(503, "service_unavailable", "The catalog service returned an unusable response.");
      }
      const bytes = await boundedBytes(upstream.body, RESPONSE_LIMIT, controller.signal, true);
      const headers = new Headers(SAFE_HEADERS);
      headers.set("content-type", csv ? "text/csv; charset=utf-8" : "application/json; charset=utf-8");
      if (csv) headers.set("content-disposition", 'attachment; filename="catalog-output.csv"');
      return new Response(bytes as BodyInit, { status: upstream.status, headers });
    } catch (error) {
      const outcome = controller.signal.aborted ? controller.signal.reason : error;
      if (outcome instanceof TransportError) return transportError(outcome.status, outcome.code, outcome.message);
      return transportError(503, "service_unavailable", "The catalog service is unavailable. Make a new attempt when it is ready.");
    } finally {
      clearTimeout(totalTimer);
      clearTimeout(stageTimer);
      request.signal.removeEventListener("abort", onCancel);
      if (controller.signal.aborted && upstream?.body && !upstream.body.locked) void upstream.body.cancel().catch(() => {});
      if (isPost) posts--; else reads--;
    }
  };
}
