# Catalog workflow API contract

Status: proposed implementation contract. This document specifies the bounded feature in
[spec.md](../spec.md), the decisions in [research.md](../research.md), and the persistence model in
[data-model.md](../data-model.md). No handlers, clients, database migrations, or tests have been
implemented by writing this contract. Exact API/envelope defaults below are lead-resolved choices;
they are not quoted user requirements or approval of a directory layout.

## Responsibility and access

The browser calls same-origin Next.js routes only. Next.js is the backend-for-frontend (BFF): it
validates transport envelopes, forwards the request with cancellation, and presents the Go result.
Go owns source intake, parsing, validation, the two deterministic rules, processing limits,
persistence, preview projection, and CSV serialization. The BFF does not recalculate products,
prices, counts, or inclusion decisions.

Go REST and PostgreSQL are private to the application network. A server-configured Go origin is not
accepted from browser input or exposed as a browser URL. The Go SaaS Manager supplies one seeded
synthetic workspace from trusted configuration; neither JSON, form fields, query parameters, nor
forwarded browser headers may select a workspace. Run lookup always includes that trusted scope.

This phase has no full authentication, account registration, agency administration, provider OAuth,
or proven multi-tenant access model. Public exposure remains behind the separate operator-access,
TLS, and proxy-limit gate. Private networking and a seeded workspace do not replace that gate.

## Routes

| Browser-facing Next.js route | Private Go route | Result |
| --- | --- | --- |
| `GET /api/catalog/samples` | `GET /v1/catalog/samples` | Available synthetic sample descriptors. |
| `POST /api/catalog/runs` | `POST /v1/catalog/runs` | Synchronously process a sample or upload; return the completed run or a typed failure. |
| `GET /api/catalog/runs/{id}` | `GET /v1/catalog/runs/{id}` | Retrieve a known run in the configured workspace. |
| `GET /api/catalog/runs/{id}/export` | `GET /v1/catalog/runs/{id}/export` | Download a completed run's real CSV export. |

The Go and Next.js routes share the payload/status contracts below. Next.js may reject an invalid
or oversized envelope before forwarding it and maps a Go connection failure into the same safe
error format. Unsupported methods return `405`. There are no remote URL, provider-management,
background-job, failure-toggle, run-history, retry, or cancellation endpoints in this feature.

## Source and processing contract

One injected in-process source interface opens raw CSV input. The built-in sample implementation
uses a deterministic synthetic fixture; a handwritten callback mock can replace source behavior
for automated verification. Uploaded bytes and sample bytes reach the same real Go parser. The
mock never substitutes normalized products, rule execution, persisted result rows, or CSV export.
Unconfigured mock calls fail explicitly. A source failure is injected in test composition, not by
a public route, arbitrary header, query parameter, or provider deployment.

Go admits at most two processing requests at a time in its single instance. Admission is immediate;
excess work returns `429`, with no queue. An admitted attempt has a 30-second processing deadline,
bounded request-scoped work, and a PostgreSQL run record. A `201` response follows successful atomic
completion; admission alone does not return `202` or imply background processing.

The BFF forwards browser cancellation and does not automatically retry POST. Its upstream/server
timeouts must allow the Go deadline response to propagate during the later runtime verification.
A disconnect can prevent delivery of any HTTP response. Failure recording is best-effort and
conditional on the run still being `processing`; a committed completed result remains valid.

## GET samples

Return `200 application/json` with stable descriptors. The initial sample ID is `catalog-basic-v1`.
Descriptors contain no raw file bytes, provider account information, or filesystem paths.

```json
{
  "samples": [
    {
      "id": "catalog-basic-v1",
      "label": "Basic catalog",
      "description": "Synthetic products with available and unavailable items."
    }
  ]
}
```

## POST runs

### Sample request

Use `Content-Type: application/json`. The complete JSON body is limited to 16 KiB. The only fields
are `sample_id`, `title_prefix`, and `exclude_unavailable`. `sample_id` is required and must name a
listed sample. `title_prefix` is an optional string, default `""`; `exclude_unavailable` is an
optional boolean, default false. Nulls, unknown fields, duplicate keys, mixed source modes, wrong
types, and an unknown sample ID are invalid envelopes and return `400` before admission.

```json
{
  "sample_id": "catalog-basic-v1",
  "title_prefix": "Demo: ",
  "exclude_unavailable": true
}
```

### Upload request

Use `Content-Type: multipart/form-data` with a valid boundary and exactly one file part named
`file`. Optional single form fields are `title_prefix` and `exclude_unavailable`; the latter accepts
only literal `true` or `false`, default false. Prefix defaults to the empty string. Repeated or
unknown fields, additional files, a `sample_id`, or malformed multipart framing return `400`.

The CSV file payload is limited to 1 MiB (1,048,576 bytes). The complete multipart body is limited to
1 MiB plus 16 KiB of envelope overhead. Enforce both bounds while reading, including requests with
missing or misleading `Content-Length`; a filename or claimed MIME type does not validate CSV.
Discard the original filename and use neutral source metadata `{"kind":"upload"}`. A missing
file is an envelope error; an empty file is invalid CSV.

### Rules and CSV semantics

The same input contract applies to uploaded and sample bytes:

- UTF-8 comma-separated CSV; accept one leading UTF-8 BOM and LF or CRLF record endings. Headers are
  the exact case-sensitive names `sku`, `title`, `price`, `currency`, `availability`, in any order,
  each once. Reject extra/missing/duplicate headers, malformed quoting, or unequal record widths.
- Require 1–1,000 product records. Header-only input is invalid. Trim surrounding whitespace from
  each product field and validate every product before applying exclusion.
- SKU is unique within the input, case-sensitive, nonempty, at most 128 ASCII characters, starts
  with an ASCII letter/digit, and otherwise contains only ASCII letters/digits, `.`, `_`, or `-`.
- Input title is nonempty and at most 200 Unicode characters. Prefix is at most 64 Unicode
  characters, is preserved literally, and can be empty. Reject control characters in title/prefix.
- Price is an unsigned base-10 decimal: integer digits, optionally followed by a decimal point and
  one to four fractional digits; at most 14 integer digits. Reject signs, exponent notation,
  grouping separators, empty fractional parts, overflow, and excess precision. Never use a binary
  floating-point representation in the processing or JSON contract.
- Currency must already contain exactly three uppercase ASCII letters after trimming; do not
  infer currency conversion or silently uppercase invalid input. Availability is exactly
  `in_stock` or `out_of_stock` after trimming.
- Apply the literal prefix once to the original normalized title, then apply exclusion. Reject a
  normalized or resulting title whose first non-whitespace character is `=`, `+`, `-`, or `@`.
  Validate resulting titles even for products later excluded. Output title is at most 264 Unicode
  characters. Exclusion is enabled only by the captured boolean and removes `out_of_stock` items.
- Preserve original product order among retained items. A valid all-excluded input succeeds with
  zero output rows. Field validation failures invalidate the whole input and return `422`;
  file/envelope/row capacity violations return `413`.

These exact bounds and envelope semantics are lead-selected defaults for this phase. They are not
production-scale guarantees or a generalized transformation language.

Validate rule values in Go before creating the database run: over-length, invalid UTF-8 or control
characters in a prefix return `422` without a run ID, rather than surfacing a database constraint
failure. Checks involving the combined input title still run after parsing and before completion.

### Completed response

Return `201 application/json` with a `run` object. Run IDs are opaque UUID strings generated by Go;
clients treat them as identifiers, not authority. JSON timestamps are UTC RFC 3339 strings. The
placeholder below describes shape and is not an actual run. Example product values are synthetic.

```json
{
  "run": {
    "id": "<run-id>",
    "status": "completed",
    "source": {"kind": "sample", "sample_id": "catalog-basic-v1"},
    "rules": {"title_prefix": "Demo: ", "exclude_unavailable": true},
    "counts": {"input": 2, "included": 1, "excluded": 1},
    "started_at": "<UTC timestamp>",
    "finished_at": "<UTC timestamp>",
    "preview": {
      "columns": ["sku", "title", "price", "currency", "availability"],
      "rows": [
        {
          "sku": "ITEM-001",
          "title": "Demo: Sample item",
          "price": "12.34",
          "currency": "USD",
          "availability": "in_stock"
        }
      ]
    },
    "export_available": true,
    "failure": null
  }
}
```

The preview contains every included row within the input bound, not a truncated sample. All five
product fields are strings; price is canonical, with unnecessary fractional zeros removed (`12.0000`
→ `"12"`, `0.0000` → `"0"`). Counts are integers with `input = included + excluded`. Original
normalized values and excluded result rows persist in PostgreSQL but are not duplicated in this
response. The Go server supplies the final preview projection; the UI does not recreate it from
original data. Clients construct the browser export route from the run ID.

The captured rules label this result even if the operator has edited controls since it completed.
Another submission is a new run. The feature provides no POST idempotency key, automatic retry, or
recovery of a run ID that was lost with the response.

## GET run

Return `200 application/json` with the same `run` representation when the ID exists in the configured
workspace. Unknown IDs, invalid UUID paths, and out-of-scope IDs return the same `404` result.

| Stored state | Representation |
| --- | --- |
| `completed` | Counts, immutable preview, finish time; `export_available: true`; `failure: null`. |
| `processing` | Counts and preview null; finish time null; `export_available: false`; failure null. This is observable stored state, not a promise of a resumable background job. |
| `failed` | Counts and preview null; finish time set; `export_available: false`; safe failure object. |

A failed run's `failure` contains `code`, `message`, `details`, and the persisted `details_truncated` flag as described
below. It may report `cancelled` or `interrupted`. The single Go process marks leftover processing
records interrupted during startup. A database lookup failure returns `503`, not `404` or an empty
run. No list/history endpoint is required; retrieval depends on a known ID.

## GET export

Only a committed completed run can be exported. Read its stored included rows in original order and
use the same canonical Go row projection as preview. Do not reread raw source bytes, use current UI
settings, or execute transformations again.

Return `200` with:

- `Content-Type: text/csv; charset=utf-8`;
- `Content-Disposition: attachment; filename="catalog-output.csv"`;
- `Cache-Control: no-store`;
- canonical header order `sku,title,price,currency,availability`, proper CSV escaping, LF record
  endings, and no UTF-8 BOM.

The fixed filename contains neither uploaded filenames nor user/account identifiers. Serialize the
entire bounded output before committing successful response headers so a local read/serialization
failure can still become a typed error. Next.js forwards the completed CSV body and safe download
headers; it does not parse and regenerate the CSV. For an all-excluded completed run, the body is
exactly the canonical header followed by LF. Its `export_available` remains true.

Unknown/out-of-scope run returns `404`; processing or failed run returns `409` with
`export_not_completed`; database unavailability returns `503`. Interrupted/cancelled attempts never
become downloadable merely because the request once started.

## Errors

All error responses use `application/json` and `Cache-Control: no-store`. Expose a stable category
and actionable safe message; do not send stack traces, SQL text, dependency exceptions, raw CSV
values, original filenames, credentials, or network configuration. Next.js preserves Go error
categories rather than turning every failure into success or a generic empty result.

```json
{
  "error": {
    "code": "validation_error",
    "message": "The catalog contains invalid product values.",
    "run_id": "<run-id-if-created>",
    "details": [
      {"code": "invalid_price", "row": 2, "field": "price", "message": "Use a nonnegative decimal with at most four fractional digits."}
    ],
    "details_truncated": false
  }
}
```

Omit `run_id` when no run was created. An admitted error may include a known ID even if recording
the failure was not possible; that is not a claim that the persisted state is already failed.
Details contain at most 100 issues. Top-level messages are at most 256 Unicode characters and
issue messages at most 160; codes are from a fixed implementation vocabulary. `row`, when known,
is the one-based product-record position. An optional `line` may identify a physical CSV line for
syntax errors. `field`, when known, is a canonical field or rule name; never echo an untrusted
header as a field name. Omit unknown locations and set `details_truncated` when issues are omitted.

| HTTP status | Error code | Meaning and user action |
| --- | --- | --- |
| `400` | `invalid_request` | Malformed envelope, unknown sample, unknown/repeated field, or invalid field type; correct the request. |
| `413` | `input_limit` | File, complete request envelope, or product-row capacity exceeded; provide a smaller supported input. |
| `415` | `unsupported_media_type` | POST is neither supported JSON nor multipart; use a supported request encoding. |
| `422` | `validation_error` | CSV/schema/product/rule validation failed as a whole; correct the bounded reported issues. |
| `429` | `capacity_exceeded` | Both Go processing slots are occupied; make a deliberate later attempt. No run is queued. |
| `503` | `source_unavailable` | Input source failed before valid completion; no successful empty catalog is implied. |
| `503` | `database_unavailable` | Required persistence/read failed or completion could not be established; a known-ID lookup may later reveal a committed result. |
| `503` | `service_unavailable` | BFF could not reach the private Go service; no processing outcome is asserted. |
| `504` | `deadline_exceeded` | The processing deadline or upstream wait expired; completion is not inferred from timeout. |
| `404` | `run_not_found` | Run is unknown, invalid, or outside the configured workspace; no existence detail is disclosed. |
| `409` | `export_not_completed` | Run exists but has no committed completed output; download is unavailable. |
| `500` | `internal_error` | An unexpected local failure; bounded generic message only. |

If the browser connection is gone, no HTTP response is guaranteed. A best-effort persisted failure
may use `cancelled`; startup recovery uses `interrupted`. If the completed-result transaction already
committed, preserve it even when an HTTP response or commit acknowledgment was lost. Failure updates
must be conditional on `processing`, and known-ID GET must report the actual database outcome.

## Verification scope

This contract is exercised by exactly two happy and two sad acceptance scenarios in
[spec.md](../spec.md): H1 sample round trip, H2 equivalent upload plus restart retrieval, S1 invalid
or over-limit input, and S2 injected source failure. Named validation/admission/cancellation fixtures
are supporting assertions within this bounded feature, not additional user journeys. Provider calls,
multi-tenant authorization, public exposure, and later Supabase migration are not proven by those
checks. Implementation and execution evidence are still pending.
