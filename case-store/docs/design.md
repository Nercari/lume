# Lume case store: design

Part of #7. This document defines the minimum local store for one case, and how Lume keeps cases
apart, protects stored data, removes it, and resumes interrupted work. The code is in `src/`.
The tests are in `test/`. All tests use synthetic, non-legal fixtures.

## 1. Scope and limits

- The store is local to the browser profile (IndexedDB in the MV3 extension). It does not
  synchronize case data. There is no sync option. A future sync feature needs a separate
  decision and a permitted route from #3.
- The store holds data for one user on one device. It does not give access control between
  operating-system users. The browser profile and the device lock give that protection.
- Tests with real case content need the permitted route from #3. Until then, this design is
  verified with synthetic fixtures only.

## 2. Minimum per-case store

Each case has an opaque local case ID (`[A-Za-z0-9_-]{1,64}`). The case ID must not be the PJe
case number or contain a party name. The extension keeps the map from the PJe case to the local
ID inside the encrypted inventory record.

| Kind | Record name | Content | Why Lume needs it |
|---|---|---|---|
| `inventory` | `index` | Document list, pages, read status | Coverage and resume of the reader (#4) |
| `extraction` | `<docId>@<version>` | Extracted text and provenance for one version | Source references; a new version never replaces an old one (#2) |
| `call` | `<stepId>` | Step status, attempt count, result, redacted error | Completed analysis calls are not sent again |
| `conversation` | `<conversationId>` | Messages of one case chat | Case discussion (#8) |
| `draft` | `<draftId>` | Generated revisions, the user edit, conflict | Manual edits are never overwritten (#8) |
| `checkpoint` | `<name>` | Small resume state (for example, last page read) | Durable resume after restart |
| `temp` | `<name>` | Downloads and intermediate data, with a TTL | Short-lived; removed on expiry and with the case |

Key layout in one IndexedDB object store:

```
case/<caseId>/meta               created, expiresAt, pause state
case/<caseId>/<kind>/<name>      one record
keys/<caseId>                    per-case non-extractable AES-GCM key
```

The backend contract is `get(key)`, `put(key, value)`, `delete(key)`, `keys(prefix)`
(`src/backend.js`). The browser build wraps one IndexedDB object store. Tests use
`MemoryBackend`. A new `CaseStore` on the same backend is how the tests model a worker restart
or a browser restart.

## 3. Case isolation

- A `Case` handle builds keys only under `case/<caseId>/`. Record names and case IDs are
  validated. A name with `/` or `..` is refused, so a name cannot point into another case.
- Each case has its own encryption key. The full record key is the AES-GCM additional data. A
  record copied into another case does not decrypt (`test/isolation.test.js`).
- Pause state belongs to one case. A paused case does not stop work on another case.

## 4. Protection of stored content, temporary files and logs

- **Encryption at rest.** `createAesGcmCodec` encrypts every record with a per-case,
  non-extractable WebCrypto AES-GCM key and a random 12-byte IV. The key is a `CryptoKey` in
  IndexedDB; script cannot export its bytes. This protects against copies of the IndexedDB files.
  It does not protect against code that runs inside the extension. The codec is a hook: a
  stronger key source (for example, a key held by the companion from #5) can replace it.
- **Temporary data.** Downloads and intermediate data go only into `temp` records of the case.
  Lume writes no temporary files outside the store. Temp records have their own TTL.
- **Logs and diagnostics.** `diagnostics()` gives counts per kind, step status, attempt counts,
  pause reason and expiry time. It gives no record values, no draft text and no conversation
  text. Error text is redacted (`src/redact.js`) before it is stored and again before it is
  shown, and it is cut to 200 characters. Redaction removes bearer tokens, JWTs, `sk-` keys,
  `token=`/`cookie=`/`session=`/`password=`-style pairs, and long opaque strings.
- **Credentials.** The store never receives PJe cookies, certificates, PJe credentials or model
  tokens. Model tokens stay in the companion (#5). PJe access uses the open browser session.

## 5. Expiration and deletion

- Each case expires `caseTtlMs` (default 30 days) after it was last opened. `expire()` deletes
  expired cases and expired temp entries of the remaining cases.
- `deleteCase(id)` first deletes the case key (crypto-erase), then every record under the
  case prefix. If deletion stops halfway, the remaining records cannot be decrypted.
- Deletion and expiry use the case prefix only. Other cases are not touched
  (`test/expire.test.js`).

## 6. User edits and generated revisions

- A draft keeps a list of generated revisions and one user edit, apart.
- The current text is the user edit if one exists; else the latest generated revision.
- A generated revision that arrives after a user edit does not replace the edit. The draft gets
  a `conflict` that the editor shows. The user resolves it: `keep-user` or `take-generated`.
- `addGeneratedRevision(..., { stepId })` is idempotent per step. A step replayed after a
  restart does not add a second revision.

## 7. Retries, checkpoints and paused states

- `runStep(stepId, fn)` runs one side effect (an analysis call, a PJe read).
  - A step with status `done` returns its stored result. `fn` is not called again.
  - The attempt count is written before each call. The retry budget (`maxAttempts`, default 3)
    holds across worker and browser restarts.
  - `fn` gets a stable `idempotencyKey` (`<caseId>:<stepId>`). If the worker stops after the
    remote call completed but before the result was stored, the remote side can deduplicate.
    Without remote deduplication, that one window is at-least-once.
  - Transient errors retry with exponential backoff until the budget is used. Then the step is
    `failed`. Only a user action (`resetStep`) gives it a new budget.
- Auth and quota failures do not retry:
  - HTTP 401, `auth_expired`, `subscription_sharing_invalid_user` → pause `auth_expired`.
  - HTTP 429, `quota_exhausted`, `subscription_sharing_usage_limit_exceeded` → pause
    `quota_exhausted`.
  - These codes match `companion/src/pause.js` in the #5 PR.
- A paused case refuses every step without a call. The pause is durable. `resume()` is a user
  action; it clears the pause and gives paused steps a new budget. There is no automatic retry
  loop.

## 8. PJe reads need an open, authenticated browser

- PJe reads use the authenticated session of an open browser tab. A step that reads PJe uses
  `needsBrowserSession: true`. If no such session is available, the case pauses with
  `pje_session_unavailable` and the read is not attempted.
- A queued step does not mean that Lume can read PJe when the browser is closed. Lume does not
  use the API `background` parameter and does not keep PJe sessions alive.

## 9. Open items

- The IndexedDB backend adapter and service-worker wiring belong to the extension (#4). They
  must use this contract.
- Live checks with permitted real cases need #3.
- Delete is not one transaction. Crypto-erase first makes a partial delete safe.
