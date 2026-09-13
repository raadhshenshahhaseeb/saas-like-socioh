# Specified owner-journey architecture

**Specified, not implemented.** These three diagrams visualize the reviewed revision-2 contracts,
not the current executable. The [current architecture](../../docs/architecture.md) separately describes
the implemented CSV slice. Diagram participants are responsibilities or documented contract types;
they do not imply deployed services or existing concrete Go classes.

The [specification](spec.md) and [owner-journey revision](owner-journey-revision.md) own product scope.
[API](contracts/catalog-api.md), [provider ports](contracts/provider-ports.md) and
[data model](data-model.md) own exact signatures, states, limits and transaction rules. These visuals
are explanatory views, not an additional authority for those definitions.

## Specified owner-to-catalog sequence

All protected requests pass Go session/membership/resource checks, including requests abbreviated
below. SaaS and Connector Manager remain in one Go process. The source participant represents either
the Shopify-like JSON mock or generic-feed CSV mock; upload remains an authenticated alternative.

```mermaid
sequenceDiagram
    actor Owner as Demo owner
    participant Next as Next.js BFF
    participant SaaS as Go SaaS authority
    participant Connector as Go Connector Manager
    participant Source as Backend mock source
    participant AppDB as Application records

    Note over Owner,AppDB: Specified revision 2 - not implemented
    Owner->>Next: Submit credentials
    Next->>SaaS: Login through fixed private route
    SaaS->>AppDB: Verify user and membership, store hashed session
    SaaS-->>Next: User, workspace and server-only session token
    Next-->>Owner: HttpOnly cookie and public session view
    Owner->>Next: Connect selected mock provider and account
    Next->>Connector: Forward connection request with session token
    Connector->>SaaS: Verify session and workspace authority in Go
    Connector->>AppDB: Store pending attempt and nonce hash
    Connector-->>Next: Attempt metadata and one-time nonce
    Next-->>Owner: Show simulated consent
    Owner->>Next: Approve with nonce
    Next->>Connector: Authorized approval decision
    Note over Connector: Provider lifecycle try-lock and prevalidation
    Connector->>Source: Authorize candidate connection and scoped capability
    Source-->>Connector: Candidate synthetic grant
    Connector->>AppDB: Revalidate authority, expiry and revision, then commit grant and consume attempt
    Note over Connector: Release lifecycle lock on every exit
    Connector-->>Next: Confirmed connection
    Next-->>Owner: Connected source
    Owner->>Next: Discover source catalogs
    Next->>Connector: List catalogs under active grant
    Connector->>Source: Catalogs
    Source-->>Connector: Authorized catalog descriptors
    Connector-->>Next: Catalog descriptors
    Next-->>Owner: Available choices
    Owner->>Next: Fetch selected catalog with captured rules
    Next->>Connector: Authorized processing request
    Connector->>AppDB: Admit processing run
    Connector->>Source: Fetch bounded raw snapshot
    Source-->>Connector: JSON or CSV plus complete provenance
    Connector->>Connector: Decode, normalize, validate, prefix, exclude
    Connector->>AppDB: Atomically persist completed run and result rows
    Connector-->>Next: Immutable result and CSV availability
    Next-->>Owner: Inspect result or download CSV
    Note over Owner,AppDB: Completed processing is not publication
```

Denied/cancelled/expired attempts issue no active grant. Approval calls the mock outside any app
transaction, then revalidates before consuming the attempt. Lost creation responses are recovered
through the safe attempt list; a lost nonce is not disclosed again. An unexpired pending attempt can
be cancelled/restarted; an expired one permits a fresh attempt directly. Source failure/incompleteness
does not become successful empty input. Disconnect blocks new authority admissions but cannot promise
to retract already authorized in-flight work.

## Specified publication and recovery sequence

Prerequisites: authenticated owner, an immutable nonempty completed run and an active authorized
mock Meta target. The full-replacement confirmation binds that exact run and target. App replay key
and provider idempotency key are different. The two database participants below are independent
repositories/transactions, even though this demo specifies one physical PostgreSQL server.

```mermaid
sequenceDiagram
    actor Owner as Demo owner
    participant Next as Next.js BFF
    participant Publish as Go publication orchestration
    participant AppDB as Application intent records
    participant Meta as Backend mock Meta adapter
    participant Effects as Independent mock effect ledger

    Note over Owner,Effects: Specified revision 2 - not implemented
    Owner->>Next: Confirm replacement with client request_id
    Next->>Publish: Session token, run and target selection
    Publish->>Publish: Verify session, membership and resource authority in Go
    Publish->>Publish: Allocate server publication UUID and reserve operation lock
    Publish->>AppDB: Replay lookup before new capacity and target admission
    alt Exact application replay
        AppDB-->>Publish: Existing immutable intent
        Publish->>Publish: Release unused candidate lock without submitting
        Publish-->>Next: Existing publication
        Next-->>Owner: Recorded outcome
    else New intent
        Publish->>AppDB: Commit pending intent while operation lock is held
        Note over Publish: Concurrent reconcile or retry returns busy without adapter calls
        Publish->>Meta: Submit server UUID key and exact stored projection
        Meta->>Effects: Independent commit of receipt and full replacement
        Effects-->>Meta: Receipt, duplicate key never reapplies old contents
        alt Acknowledgment and fresh readback available
            Meta-->>Publish: Receipt
            Publish->>Meta: Readback by target and server key
            Meta->>Effects: Fresh receipt, projection and current target lookup
            Effects-->>Meta: Independent observation
            Meta-->>Publish: Target, bytes, hash, count and current receipt
            Publish->>AppDB: Record published only after matching readback
        else Submission or readback outcome uncertain
            Meta-->>Publish: Unknown outcome
            Publish->>AppDB: Record unknown when possible and keep target unresolved
        end
        Publish->>Publish: Release operation lock on every exit
        Publish-->>Next: Recorded publication or safe persistence error
        Next-->>Owner: Honest state, completed CSV remains available
    end
    opt Later explicit reconciliation of an eligible idle record
        Owner->>Next: Check destination
        Next->>Publish: Recheck authority, state and operation lock
        Publish->>Meta: Readback only, never Submit
        Meta->>Effects: Fresh independent query
        Effects-->>Meta: Independent observation
        Meta-->>Publish: Readback result
        Publish->>AppDB: Record readback and preserve historical publication
        Publish-->>Next: Updated publication state
        Next-->>Owner: Recorded outcome
    end
```

The uncertainty branch may follow a committed replacement; it does not promise unchanged destination
contents. A definite no-effect rejection records failed and preserves prior contents. Pending after
crash becomes unknown. Failed records cannot reconcile away a permanent rejection: only eligible
definite not-applied/latest intents can explicitly retry, using the original server key. Unknown
must reconcile first; a busy operation permits neither action. See the
[action eligibility matrix](contracts/catalog-api.md#action-eligibility).

Historical receipt and current target are different facts. A newer replacement does not invalidate
the earlier receipt, and replaying its key does not restore old contents. Application reset leaves
mock effects intact; independent mock reset is a separate guarded operation. Neither reset is a
public endpoint. For pending/unknown intent, authoritative absence can settle failed/not-applied.
Absence after a previously verified publication preserves that historical published record and reports
missing current effect; it does not rewrite history or silently reapply the old output.

## Specified provider-contract types

This UML-style diagram shows the **documented Go interface contracts and value names**, not source
declarations or concrete classes. Signatures are abbreviated; each operation accepts context and
returns an error as specified in [provider ports](contracts/provider-ports.md). Concrete adapter
struct names are intentionally omitted until implementation establishes them.

```mermaid
classDiagram
    direction LR
    class ConnectionAuthorizer {
        <<interface>>
        +Authorize(AuthorizationInput) Grant
        +Revoke(Grant)
    }
    class SourceProvider {
        <<interface>>
        +Catalogs(Grant)
        +Fetch(Grant, catalogID) RawSnapshot
    }
    class DestinationProvider {
        <<interface>>
        +Catalogs(Grant)
        +Submit(Grant, PublicationInput) Receipt
        +Readback(Grant, Target, key) Observation
    }
    class Grant {
        <<contract>>
        connection and workspace scope
        provider account and capability
        revision and expiry
    }
    class RawSnapshot {
        <<contract>>
        raw body and format
        schema revision and completeness
    }
    class PublicationInput {
        <<contract>>
        server publication key and target
        immutable projection hash and count
    }
    class Receipt {
        <<contract>>
        original key and target
        applied time and sequence
    }
    class Observation {
        <<contract>>
        independent receipt and projection
        current receipt and observation time
    }
    ConnectionAuthorizer ..> Grant : issues or revokes
    SourceProvider ..> Grant : requires
    SourceProvider ..> RawSnapshot : returns
    DestinationProvider ..> Grant : requires
    DestinationProvider ..> PublicationInput : consumes
    DestinationProvider ..> Receipt : returns
    DestinationProvider ..> Observation : reads independently
```

The specified adapters are Shopify-like mock, generic-feed mock and Meta-like mock, all in the same
Go deployment. Real provider authentication, wire schemas, pagination, permissions and conformance
remain later integration work; implementing these ports does not certify production compatibility.

## Verification boundary

[T028](tasks.md) completed document consistency review. Implementation begins at T029; the new
identity, connector, publication and lifecycle behavior still needs source, Go/PostgreSQL/BFF,
post-stability UI/UX and independent browser evidence. These diagrams neither execute those checks
nor turn historical CSV-slice results into revised acceptance.
