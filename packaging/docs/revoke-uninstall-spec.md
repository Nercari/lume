# Logout, revocation, and uninstall expectations

Part of #13. Normative behavior for packaging acceptance. Automated checks live in
`packaging/test/revoke-uninstall.test.js` using mocks from #5 (`companion/`) and #7
(`case-store/`). No network calls.

## Authorization teardown (#5)

### Companion `logout` command

The native messaging host exposes only `status`, `login.start`, and `logout` (`companion/src/commands.js`).

**Assert R1.** After a successful `logout`, the OS vault adapter has **no** entry for
`lume.chatgpt.<accountKey>`.

**Assert R2.** When a `revokeFn` is provided and succeeds, `logout` returns `{ revoked: true }`
and the refresh token passed to `revokeFn` matches the stored refresh token.

**Assert R3.** When `revokeFn` fails (network), `logout` still clears the vault and returns
`{ revoked: false }`.

**Assert R4.** Terminal refresh errors (`invalid_grant`, `refresh_token_reused`, …) clear
tokens via `TokenCustody.clear()` and surface `auth_expired` to callers.

Mocks: `companion/test/custody.test.js`, re-run from packaging tests.

### No alternate credentials

**Assert R5.** Packaging guides and observer checklist contain no instruction to paste API
keys, refresh tokens, or enable paid fallback (see `guides.test.js`).

## Local case material teardown (#7)

### Per-case delete

**Assert D1.** `CaseStore.deleteCase(caseId)` removes every backend key containing that
`caseId`, including `keys/<caseId>`.

**Assert D2.** Another open case’s drafts and temp blobs remain readable after delete.

Mocks: `case-store/test/expire.test.js` patterns, `CASE_A` / `CASE_B` fixtures.

### Expiry

**Assert D3.** `expire()` removes only cases past TTL and temp entries past their TTL; it does
not delete active cases.

### Diagnostics after delete

**Assert D4.** After delete, `diagnostics()` for the removed case is unreachable; remaining
cases report counts only, never draft text.

## Extension uninstall (manual acceptance)

Automated tests do not drive Chrome. Document these manual checks for observers:

**Assert E1.** After extension removal, the side panel entry disappears.

**Assert E2.** IT removes the native messaging manifest so `logout` and `login.start` are not
callable from a stale extension ID.

**Assert E3.** Combined companion removal + case delete leaves no Lume-controlled refresh token
(R1) and no decryptable case records (D1).

## Mapping to issue #13 Done-when

| Done-when item | Evidence |
|----------------|----------|
| Reproducible package + guide | `package-layout.md`, `user-guide.md`, CI green |
| Three users complete full flow | **BLOCKED** — `observer-checklist.md` not filed |
| Removal leaves no active auth or stray case material | R1–R3, D1–D4 in CI; E1–E3 in live observer form |
| License and limitations match product | `attribution-checklist.md`, `permissions-and-limits.md` |
| Release readiness | **BLOCKED** — signing, store, public URL need #14 |
