# Backend provider ports and fixture grammars

Status: normative design contract for the [owner-journey revision](../owner-journey-revision.md),
2026-09-13. This defines simulated provider behavior, not a real Shopify/Meta API or completed code.
Read with [HTTP contracts](catalog-api.md) and [persistence](../data-model.md).

## Composition and authority

One Go process composes SaaS, Connector Manager, catalog stages and concrete adapters. Production-demo
adapters live in Go source; test-only faults are injected through constructors. No browser fixtures,
extra provider deployment, arbitrary outbound URL, real provider token or advertising request.

Define consumed interfaces in `internal/connector`; concrete adapters belong under
`internal/connector/providers/{shopifymock,feedmock,metamock}`. Shared neutral input/result structures
may be in a child contract package to avoid cycles. Required dependencies are explicit:

```go
type ConnectionAuthorizer interface {
    Authorize(context.Context, AuthorizationInput) (Grant, error)
    Revoke(context.Context, Grant) error
}
type SourceProvider interface {
    Catalogs(context.Context, Grant) ([]CatalogDescriptor, error)
    Fetch(context.Context, Grant, string) (RawSnapshot, error)
}
type DestinationProvider interface {
    Catalogs(context.Context, Grant) ([]CatalogDescriptor, error)
    Submit(context.Context, Grant, PublicationInput) (Receipt, error)
    Readback(context.Context, Grant, Target, string) (Observation, error)
}
```

These are signatures, not implementations. Every method honors request cancellation and validates
its grant/account/selected asset. Unsupported/unconfigured calls return typed errors. A source
returns raw bytes, never a pre-completed domain run. The destination receives an immutable output
projection, never mutable UI settings or an application SQL transaction.

The Connector Manager constructor accepts typed config, clock, SaaS authorization, connection/run/
publication repositories, and explicit maps of supported authorizers/source/destination adapters.
The application root constructs PostgreSQL once and injects separate repositories; it owns closing
resources. The mock Meta adapter receives its own ledger interface whose operations commit
independently. Managers receive neither a global service locator nor unrestricted application state.

Manager operations take an authenticated `Principal` and resolve resource ownership through SaaS
and scoped repositories. A principal contains server-resolved user/workspace/session identity; it
is not decoded from browser JSON. SaaS checks active session/membership, including immediately before
a new provider effect. Credentials/session tokens are never fields of public provider DTOs.

## Port value contracts

| Type | Fields and meaning |
|---|---|
| `AuthorizationInput` | `ConnectionID`, workspace/user IDs, provider ID, external account ID, required capability and next grant revision; derived from a validated pending attempt whose requested decision is approve. Initial ConnectionID is a server-generated candidate UUID; reconnect uses the persisted ID. |
| `Grant` | Connection/workspace/provider/account IDs, opaque mock grant reference, positive revision, capability, issued/expiry instants. Internal only. |
| `CatalogDescriptor` | `id`, `label`, `description`, provider/account context, role `source` or `destination`; no input bytes, filesystem paths or credentials. |
| `RawSnapshot` | `Body io.ReadCloser`, `Format`, `SchemaVersion`, `Revision`, `Complete`, `ProviderID`, `CatalogID`, `FetchedAt`. Close body on every path; metadata and decoded envelope must agree. |
| `Target` | Provider ID, external account ID, external catalog ID; connection/workspace scope is supplied by the grant. |
| `PublicationInput` | Server publication UUID as idempotency key, target, `mode=replace`, canonical ordered projection bytes, SHA-256 hex hash, item count. |
| `Receipt` | Opaque receipt ID, original idempotency key, target, hash, count, applied UTC time, provider sequence, `simulation=true`. |
| `Observation` | `Found`, receipt if found, independent stored projection, current receipt ID for the target, observation time; absent is authoritative only after successful ledger query. |

An opaque provider identifier uses `[A-Za-z0-9][A-Za-z0-9._-]{0,127}`. Internal IDs use UUIDs.
Strings shown in UI are text, never trusted HTML. Grant revision is checked against the connection
before new work. Reconnection cannot silently reuse an expired revision.

## Fixed provider registry

These are synthetic fixture identifiers, not customer accounts. The standard demo has:

| Provider ID / role | External account | Catalog IDs |
|---|---|---|
| `shopify-mock` / source | `shopify-demo-store` | `shop-catalog-basic`, `shop-catalog-seasonal` |
| `feed-mock` / source | `feed-demo-account` | `feed-catalog-basic` |
| `meta-mock` / destination | `meta-demo-account` | `meta-catalog-main`, `meta-catalog-test` |

Source capability is `catalog:read`; destination capability is `catalog:write`. There is one
connection per workspace/provider kind, with account selection restricted to that workspace's
configured fixture registry. Negative integration fixtures may provide a second owner's distinct
accounts/catalogs; ordinary runtime provisions only one owner. An ID existing in another fixture
namespace does not authorize access. Provider listings identify `simulation=true` and their role.

The basic Shopify and feed fixtures normalize to the existing canonical basic CSV business rows.
Seasonal Shopify data must differ in identity/content so selection is testable. The verification
owner controls fixture contents; expected values come from those committed synthetic fixtures.
Both Meta targets support the same semantics independently.

## Shopify-like raw JSON grammar

Format `shopify_mock_json`, schema `shopify-mock.v1`, UTF-8, at most 1 MiB before decoding.
Exactly one JSON object, no BOM or trailing JSON value. Unknown/duplicate properties, nulls,
wrong types, invalid UTF-8 and unsupported schema are errors at any depth. Decoder nesting is bounded
to8 levels including arrays; this grammar requires fewer. Required properties
are illustrated with one product below; this is not the complete four-row basic fixture:

```json
{
  "schema": "shopify-mock.v1",
  "catalog_id": "shop-catalog-basic",
  "revision": "basic-v1",
  "complete": true,
  "products": [
    {
      "id": "product-001",
      "sku": "ITEM-001",
      "name": "Desk, \"Studio\" Edition",
      "price": {"amount": "12.3400", "currency": "USD"},
      "available": true
    }
  ]
}
```

`catalog_id` must equal the authorized requested catalog; `revision` is a nonempty provider
identifier; `complete` must be true. `products` contains 1–1,000 objects. Product `id` is unique
within the snapshot, follows the provider-ID grammar, and is retained as source-item provenance.
`sku`, `name`, `price.amount` and `price.currency` are strings; `available` is a JSON boolean.
Price JSON numbers, exponent notation and missing availability are not coerced.

Normalization is exactly: `name→title`, `price.amount→price`, `price.currency→currency`,
`available=true→in_stock`, `false→out_of_stock`; retain SKU and source order. Then execute the shared
canonical validation below. No variant expansion, real GraphQL schema, image mapping or fabricated
currency/identifier is implied. Malformed JSON is a validation failure; false/inconsistent snapshot
completeness is `source_incomplete` and must not install an empty result.

## CSV and shared canonical validation

Feed format is `csv`, schema `catalog-csv.v1`; upload uses the same real parser. At most 1 MiB and
1,000 data records; UTF-8, comma delimiter, CSV quoting, LF or CRLF input. Optional UTF-8 BOM is
accepted only before the header. Input contains exactly the names `sku,title,price,currency,availability`,
each once, in any order; canonical output uses the displayed order. No mapping, duplicate/unknown
headers, extra columns, header-only source or silent truncation. Embedded quoted
newlines are syntactically CSV but rejected by the shared text-control rule.

| Field | Canonical rule |
|---|---|
| SKU | Reject raw controls before trimming whitespace; trim; ASCII grammar `[A-Za-z0-9][A-Za-z0-9._-]{0,127}`; case-sensitive unique per input run. |
| Title | Reject raw Unicode control characters before trimming; trim; 1–200 Unicode characters. |
| Price | Trim string; unsigned decimal, 1–14 integer digits, optional decimal point plus 1–4 fractional digits; no exponent/grouping/sign; value below `100000000000000`. Leading zeros allowed within the integer-digit bound. |
| Currency | Trim; exactly three uppercase ASCII letters. No conversion or automatic uppercasing. |
| Availability | Trim CSV value; exactly `in_stock` or `out_of_stock`; JSON boolean mapping above precedes this check. |

Price normalization strips redundant leading integer and trailing fractional zeros: `0007.5000`
becomes `7.5`; zero becomes `0`. Persistence uses `numeric(18,4)` after lexical validation, never
float conversion or database rounding to accept invalid input.

Title prefix is valid UTF-8, at most 64 Unicode characters; preserve its whitespace exactly.
Reject controls in prefix and original/resulting titles. Reject titles whose first non-whitespace
character is `=`, `+`, `-` or `@`, before and after prefix application. Transformed title is at most
264 characters. Validate every input row before exclusion. Apply literal prefix, then exclude
`out_of_stock` when selected. Preserve source order; input errors fail the entire run with at most
100 safe issues. Valid all-excluded input succeeds for preview/header-only CSV, not publication.

## Canonical output and digest

Preview/CSV/publication use included stored rows ordered by original position. Public columns are
exactly the five canonical fields; source-item identity is provenance, not a sixth export column.
CSV uses standard quoting, LF record endings and a final LF; download filename `catalog-output.csv`.

The publication digest is SHA-256 over the UTF-8 JSON encoding of the ordered array of objects
whose property order is `sku,title,price,currency,availability`, with canonical decimal strings,
no whitespace and no trailing newline. Use Go `encoding/json` over an explicitly ordered struct,
default HTML escaping, with no `omitempty`. Hash lowercase hex. Store the exact digest bytes in the
mock ledger, so readback checks exact bytes/hash/count as well as target. This digest is not the
CSV-byte digest and must not be recomputed from browser-supplied rows.

## Mock authorization and durable destination semantics

The connector owns expiring, single-use attempts and nonce verification. Lifecycle mutations use a
non-blocking per-(workspace,provider) try-lock: attempt creation/decision/cancel, reconnect and
disconnect. The lock registry is bounded by the configured workspace/provider fixture registry
(three standard keys); untrusted IDs cannot allocate keys. A busy mutation returns409
`connection_busy`, without queueing or invoking an adapter. Reads and already admitted catalog/
publication calls do not hold this lifecycle lock throughout their work.

For approve, validate the pending attempt/current authority/revision while holding the try-lock,
release any request DB transaction/connection, and call Authorize. Initial approval allocates a
candidate ConnectionID for AuthorizationInput; pending attempt.connection_id stays null. The returned
Grant must identify that same ConnectionID, owner/provider/account/capability and expected next revision.
Revalidate session/membership, nonce/binding, attempt expiry/pending state and current connection
revision after the adapter returns, then atomically persist that exact connection ID/grant and consume
the attempt. Failure of this final check discards the candidate; it cannot become an active connection.
Always release the try-lock on success/error/cancellation. No DB transaction spans an adapter call.

The mock Authorize produces a candidate synthetic grant, not an independently committed OAuth
installation. Discarding a rejected candidate has no simulated external effect. Real OAuth exchange,
credential acquisition and recovery semantics require a separate later contract; this local atomic
attempt/connection commit does not claim they are transactional with a real provider. Deny/cancel
never calls Authorize or advances a grant. Reconnect advances the existing connection revision.

One-hour mock expiry requires reconnect, not application logout. Disconnect commits local revocation
and cancels pending reconnects before its adapter Revoke call; revoke failure cannot reactivate local
access. It blocks NEW calls seeking authority after that commit. Calls already admitted under a valid
grant may complete afterward, even if their effect had not yet been accepted at revocation time.
Preserve their actual outcome; no instantaneous cancellation or rollback is promised. Revocation
does not erase completed owned runs or past effects. Check current authority before each new call.

`Submit` validates target and bounded nonempty payload, then uses a separate ledger transaction.
For a new key, it atomically stores the full replacement/receipt and advances target sequence. For
an existing key and identical hash/target, it returns the original receipt without changing current
target sequence. Different content/target for the same workspace/key is a conflict. Cap 100 effects
per workspace; duplicate lookup precedes capacity rejection. Serialize count/insert and target
sequence updates. The ledger has no cascading dependency on app intent/connection rows.

`Readback` reads ledger state afresh, surviving process restart. It returns original receipt bytes
and the current target receipt separately. A missing row after a successful query is authoritative
absence; timeout/unavailable storage is not absence. A later replacement does not invalidate the
historical receipt, and replaying an older key does not restore its payload.

Provider errors carry a stable category and effect certainty (`not_applied` or `unknown`):
`permission_denied`, `grant_expired`, `unsupported_capability`, `catalog_not_found`, `incomplete`,
`rate_limited`, `unavailable`, `rejected`, `capacity`, `idempotency_conflict`, `outcome_unknown`.
The connector maps them to the HTTP contract without leaking internal errors or credentials.
Fault-injection constructors must distinguish failure before effect, effect committed then response
lost, and failed readback. An HTTP/network-looking error after commit is never definite failure.

## Required conformance assertions

Publication orchestration must hold its operation lock before the initial pending commit is visible,
through Submit/Readback/outcome recording. A concurrent reconcile/retry must return409
`publication_busy` without calling either adapter method or changing the target guard. Failed
publication reconcile returns409 `publication_not_reconcilable`; it cannot turn permanent rejection
into retryable not-applied. These are orchestration guards, not alternative provider outcomes.

Tests must establish same-provider lifecycle contention returns connection_busy without an adapter
call, distinct provider independence, lost attempt-creation response recovery through the bounded
workspace metadata list/cancel/restart without nonce disclosure, initial candidate-ID equality, post-authorizer expiry/logout/
revision revalidation, cancellation/error lock release, already-admitted call outcomes after revoke,
authorization/asset scope, JSON normalization and CSV equivalence, exact
money/control/duplicate rejection, grant expiry/reconnect, source error/completeness behavior,
duplicate publication key/content conflict, old-key replay after a newer replacement, independent
readback after restart, receipt-before-app-update crash, candidate-lock release on replay/error,
concurrent reconcile-during-submit with zero Readback/no false absence/no target unlock, failed
reconcile cause preservation, effective expired-attempt reads with no GET mutation, ledger capacity,
and no cascade on app reset.
These support the two happy/two sad acceptance groups; they are not real-provider certification.
