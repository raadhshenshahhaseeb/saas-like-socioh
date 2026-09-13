import { CATALOG_COLUMNS, RUN_ID, type CatalogFailure, type CatalogRun, type Rules, type Sample } from "./catalog-types";

export class CatalogError extends Error {
  constructor(readonly failure: CatalogFailure, readonly status = 0) { super(failure.message); }
}

function error(code: string, message: string): CatalogError {
  return new CatalogError({ code, message, details: [], details_truncated: false });
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function failure(value: unknown): value is CatalogFailure {
  return record(value) && typeof value.code === "string" && value.code.length <= 64 &&
    typeof value.message === "string" && value.message.length <= 1024 && Array.isArray(value.details) && value.details.length <= 100 &&
    value.details.every((item) => record(item) && typeof item.code === "string" && typeof item.message === "string" && item.message.length <= 640 &&
      (item.field === undefined || typeof item.field === "string") && (item.row === undefined || Number.isInteger(item.row)) && (item.line === undefined || Number.isInteger(item.line))) &&
    typeof value.details_truncated === "boolean";
}

function isRun(value: unknown): value is CatalogRun {
  if (!record(value) || typeof value.id !== "string" || !RUN_ID.test(value.id) ||
      !["processing", "completed", "failed"].includes(String(value.status)) || !record(value.rules) ||
      typeof value.rules.title_prefix !== "string" || typeof value.rules.exclude_unavailable !== "boolean" ||
      !record(value.source) || !["sample", "upload"].includes(String(value.source.kind)) ||
      typeof value.started_at !== "string" || typeof value.export_available !== "boolean") return false;
  if (value.status !== "completed") return value.preview === null && value.counts === null && (value.failure === null || failure(value.failure));
  return record(value.counts) && ["input", "included", "excluded"].every((key) => Number.isInteger(value.counts && (value.counts as Record<string, unknown>)[key])) &&
    record(value.preview) && Array.isArray(value.preview.columns) && value.preview.columns.join(",") === CATALOG_COLUMNS.join(",") &&
    Array.isArray(value.preview.rows) && value.preview.rows.length <= 1000 &&
    value.preview.rows.every((row) => record(row) && CATALOG_COLUMNS.every((key) => typeof row[key] === "string"));
}

async function request<T>(path: string, init: RequestInit, decode: (response: Response) => Promise<T>, signal?: AbortSignal): Promise<T> {
  const timer = AbortSignal.timeout(50_000);
  const combined = signal ? AbortSignal.any([signal, timer]) : timer;
  try {
    const response = await fetch(path, { ...init, signal: combined, credentials: "omit", cache: "no-store", redirect: "error" });
    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      if (record(payload) && failure(payload.error)) throw new CatalogError(payload.error, response.status);
      throw error("service_unavailable", "The catalog service could not complete this request. Make a new attempt.");
    }
    return await decode(response);
  } catch (cause) {
    if (cause instanceof CatalogError) throw cause;
    if (signal?.aborted) throw error("request_cancelled", "The request was cancelled.");
    if (timer.aborted) throw error("deadline_exceeded", "The request timed out. Its completion could not be confirmed.");
    throw error("service_unavailable", "The catalog service could not be reached. Check that it is running, then try again.");
  }
}

async function decodeRun(response: Response): Promise<CatalogRun> {
  const payload: unknown = await response.json();
  if (!record(payload) || !isRun(payload.run)) throw error("service_unavailable", "The catalog service returned an unexpected result.");
  return payload.run;
}

export function listSamples(signal?: AbortSignal): Promise<Sample[]> {
  return request("/api/catalog/samples", {}, async (response) => {
    const payload: unknown = await response.json();
    if (!record(payload) || !Array.isArray(payload.samples) || payload.samples.length > 20 ||
        !payload.samples.every((sample) => record(sample) && typeof sample.id === "string" && typeof sample.label === "string" && typeof sample.description === "string")) {
      throw error("service_unavailable", "Available samples could not be read.");
    }
    return payload.samples as Sample[];
  }, signal);
}

export function loadRun(id: string, signal?: AbortSignal): Promise<CatalogRun> {
  if (!RUN_ID.test(id)) return Promise.reject(error("run_not_found", "The requested catalog result was not found."));
  return request(`/api/catalog/runs/${id}`, {}, decodeRun, signal);
}

export function processCatalog(source: { sampleId: string } | { file: File }, rules: Rules, signal?: AbortSignal): Promise<CatalogRun> {
  let body: BodyInit;
  const headers: Record<string, string> = { "X-Catalog-Request": "1" };
  if ("sampleId" in source) {
    body = JSON.stringify({ sample_id: source.sampleId, ...rules });
    headers["Content-Type"] = "application/json";
  } else {
    const form = new FormData();
    form.append("file", source.file, "catalog.csv");
    form.append("title_prefix", rules.title_prefix);
    form.append("exclude_unavailable", String(rules.exclude_unavailable));
    body = form;
  }
  return request("/api/catalog/runs", { method: "POST", headers, body }, decodeRun, signal);
}

export function downloadRun(id: string, signal?: AbortSignal): Promise<Blob> {
  if (!RUN_ID.test(id)) return Promise.reject(error("run_not_found", "The requested catalog result was not found."));
  return request(`/api/catalog/runs/${id}/export`, {}, async (response) => {
    if (!/^text\/csv(?:;|$)/i.test(response.headers.get("content-type") ?? "")) throw error("service_unavailable", "The download was not a supported CSV file.");
    return response.blob();
  }, signal);
}
