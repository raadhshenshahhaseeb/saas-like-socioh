import assert from "node:assert/strict";
import { test } from "node:test";
import { createCatalogProxy } from "./catalog-proxy.ts";

const appOrigin = "http://127.0.0.1:3000";
const goApiUrl = "http://127.0.0.1:8080";

test("rejects a cross-origin POST before reading its body or calling Go", async () => {
  let reads = 0;
  let calls = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      reads++;
      controller.enqueue(new TextEncoder().encode("{}"));
      controller.close();
    },
  }, { highWaterMark: 0 });
  const request = new Request(`${appOrigin}/api/catalog/runs`, {
    method: "POST", body, duplex: "half",
    headers: { origin: "https://other.invalid", "x-catalog-request": "1", "content-type": "application/json" },
  } as RequestInit);
  const proxy = createCatalogProxy({ appOrigin, goApiUrl, fetch: async () => {
    calls++;
    return Response.json({});
  } });
  const response = await proxy(request, "/v1/catalog/runs");
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "request_forbidden");
  assert.equal(reads, 0);
  assert.equal(calls, 0);
});

test("forwards exact bytes to the fixed Go origin without client credentials or workspace headers", async () => {
  const body = '{ "sample_id": "catalog-basic-v1", "title_prefix": "Demo: ", "title_prefix": "again" }';
  const proxy = createCatalogProxy({ appOrigin, goApiUrl, fetch: async (url, init) => {
    assert.equal(String(url), `${goApiUrl}/v1/catalog/runs`);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), null);
    assert.equal(headers.get("cookie"), null);
    assert.equal(headers.get("x-workspace-id"), null);
    assert.equal(headers.get("content-type"), "application/json");
    assert.equal(new TextDecoder().decode(init?.body as Uint8Array), body);
    assert.equal(init?.redirect, "manual");
    return Response.json({ error: { code: "invalid_request", message: "Duplicate field." } }, { status: 400 });
  } });
  const request = new Request(`${appOrigin}/api/catalog/runs`, {
    method: "POST", body,
    headers: { origin: appOrigin, "x-catalog-request": "1", "content-type": "application/json", authorization: "ignored", cookie: "ignored", "x-workspace-id": "ignored" },
  });
  const response = await proxy(request, "/v1/catalog/runs");
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "invalid_request");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("rejects an oversized chunked JSON body without forwarding it", async () => {
  const proxy = createCatalogProxy({ appOrigin, goApiUrl, fetch: async () => {
    assert.fail("an oversized request must not reach Go");
  } });
  const response = await proxy(new Request(`${appOrigin}/api/catalog/runs`, {
    method: "POST", body: "x".repeat(16 * 1024 + 1),
    headers: { origin: appOrigin, "x-catalog-request": "1", "content-type": "application/json" },
  }), "/v1/catalog/runs");
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, "input_limit");
});

test("a timed-out read aborts upstream and releases its admission permit", async () => {
  let calls = 0;
  let aborted = 0;
  const proxy = createCatalogProxy({ appOrigin, goApiUrl, timeouts: { readMs: 15 }, fetch: async (_url, init) => {
    if (++calls > 4) return Response.json({ samples: [] });
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => { aborted++; reject(init.signal?.reason); }, { once: true });
    });
  } });
  const pending = Array.from({ length: 4 }, () => proxy(new Request(`${appOrigin}/api/catalog/samples`, { signal: AbortSignal.timeout(250) }), "/v1/catalog/samples"));
  const busy = await proxy(new Request(`${appOrigin}/api/catalog/samples`), "/v1/catalog/samples");
  assert.equal(busy.status, 429);
  const expired = await Promise.all(pending);
  for (const response of expired) assert.equal(response.status, 504);
  assert.equal(aborted, 4);
  assert.equal((await proxy(new Request(`${appOrigin}/api/catalog/samples`), "/v1/catalog/samples")).status, 200);
});

test("two slow POST bodies hold admission before a third body is read", async () => {
  const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
  const proxy = createCatalogProxy({ appOrigin, goApiUrl, fetch: async () => Response.json({ run: {} }, { status: 201 }) });
  const pending = Array.from({ length: 2 }, () => {
    const body = new ReadableStream<Uint8Array>({ pull(controller) { controllers.push(controller); } }, { highWaterMark: 0 });
    return proxy(new Request(`${appOrigin}/api/catalog/runs`, {
      method: "POST", body, duplex: "half", signal: AbortSignal.timeout(1000),
      headers: { origin: appOrigin, "x-catalog-request": "1", "content-type": "application/json" },
    } as RequestInit), "/v1/catalog/runs");
  });
  let thirdReads = 0;
  const thirdBody = new ReadableStream<Uint8Array>({ pull(controller) { thirdReads++; controller.close(); } }, { highWaterMark: 0 });
  const rejected = await proxy(new Request(`${appOrigin}/api/catalog/runs`, {
    method: "POST", body: thirdBody, duplex: "half", signal: AbortSignal.timeout(250),
    headers: { origin: appOrigin, "x-catalog-request": "1", "content-type": "application/json" },
  } as RequestInit), "/v1/catalog/runs");
  assert.equal(rejected.status, 429);
  assert.equal(thirdReads, 0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controllers.length, 2);
  for (const controller of controllers) { controller.enqueue(new TextEncoder().encode("{}")); controller.close(); }
  for (const response of await Promise.all(pending)) assert.equal(response.status, 201);
});

test("multipart bytes and boundary are forwarded without decoding or rebuilding fields", async () => {
  const contentType = "multipart/form-data; boundary=catalog-boundary";
  const bytes = new TextEncoder().encode('--catalog-boundary\r\nContent-Disposition: form-data; name="file"; filename="catalog.csv"\r\nContent-Type: text/csv\r\n\r\nsku,title,price,currency,availability\r\n--catalog-boundary--\r\n');
  const proxy = createCatalogProxy({ appOrigin, goApiUrl, fetch: async (_url, init) => {
    assert.deepEqual(init?.body, bytes);
    assert.equal(new Headers(init?.headers).get("content-type"), contentType);
    return Response.json({ error: { code: "validation_error" } }, { status: 422 });
  } });
  const response = await proxy(new Request(`${appOrigin}/api/catalog/runs`, {
    method: "POST", body: bytes,
    headers: { origin: appOrigin, "x-catalog-request": "1", "content-type": contentType },
  }), "/v1/catalog/runs");
  assert.equal(response.status, 422);
});

test("client cancellation reaches Go and returns a distinct cancellation outcome", async () => {
  const controller = new AbortController();
  let started!: () => void;
  const start = new Promise<void>((resolve) => { started = resolve; });
  let upstreamAborted = false;
  const proxy = createCatalogProxy({ appOrigin, goApiUrl, fetch: async (_url, init) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => { upstreamAborted = true; reject(init.signal?.reason); }, { once: true });
      started();
    });
  } });
  const pending = proxy(new Request(`${appOrigin}/api/catalog/runs`, {
    method: "POST", body: "{}", signal: controller.signal,
    headers: { origin: appOrigin, "x-catalog-request": "1", "content-type": "application/json" },
  }), "/v1/catalog/runs");
  await start;
  controller.abort();
  const response = await pending;
  assert.equal(response.status, 499);
  assert.equal((await response.json()).error.code, "request_cancelled");
  assert.equal(upstreamAborted, true);
});

test("oversized responses and redirecting upstreams produce safe failures", async (t) => {
  for (const [name, reply] of [
    ["oversized", () => new Response(new Uint8Array(4 * 1024 * 1024 + 1), { headers: { "content-type": "application/json" } })],
    ["redirect", () => new Response(null, { status: 302, headers: { location: "https://other.invalid" } })],
  ] as const) await t.test(name, async () => {
    const proxy = createCatalogProxy({ appOrigin, goApiUrl, fetch: async () => reply() });
    const response = await proxy(new Request(`${appOrigin}/api/catalog/samples`), "/v1/catalog/samples");
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("location"), null);
    assert.equal((await response.json()).error.code, "service_unavailable");
  });
});

test("source response bytes and safe download headers remain unchanged", async () => {
  const csv = "sku,title,price,currency,availability\n";
  const proxy = createCatalogProxy({ appOrigin, goApiUrl, fetch: async () => new Response(csv, {
    headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="untrusted.csv"', "set-cookie": "ignored" },
  }) });
  const id = "00000000-0000-4000-8000-000000000001";
  const response = await proxy(new Request(`${appOrigin}/api/catalog/runs/${id}/export`), `/v1/catalog/runs/${id}/export`);
  assert.equal(await response.text(), csv);
  assert.equal(response.headers.get("content-disposition"), 'attachment; filename="catalog-output.csv"');
  assert.equal(response.headers.get("set-cookie"), null);
});
