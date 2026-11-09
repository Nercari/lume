# Lume packaging: design

Part of #13. This package does not ship executable product code. It records how the MV3
extension and the minimum native-messaging companion are laid out for installation, how
nontechnical staff should use them, and how observers score a three-user study. Implementation
lives in `extension/` (#4) and `companion/` (#5). Local case data and revocation semantics
come from `case-store/` (#7).

## Goals

1. **Reproducible layout** — A maintainer can build the same tree on a representative
   workstation without guessing paths or secret values.
2. **Plain-language guides** — Install, onboarding, update, logout, revoke, and uninstall
   steps never ask users to paste tokens, API keys, or enable paid API fallback.
3. **Honest limitations** — Permissions, eligible ChatGPT plans, quotas, PJe scope, and data
   handling match what the tested packages actually do.
4. **Observable study** — An observer checklist captures the full flow for three permitted
   users. Live runs stay **BLOCKED** until #3 supplies permitted users and cases (#14).
5. **Testable teardown** — Logout/revoke and uninstall expectations are written as asserts
   against #5 and #7 APIs, exercised with mocks in `test/revoke-uninstall.test.js`.

## Package contents

| Path | Role |
|------|------|
| `docs/package-layout.md` | Build outputs, native-messaging manifest placement, version pins |
| `docs/user-guide.md` | End-user install through uninstall |
| `docs/permissions-and-limits.md` | Permissions, plan, quota, data, PJe scope, known limits |
| `docs/attribution-checklist.md` | License and dependency attribution before release |
| `docs/observer-checklist.md` | Dry-run observer form (live study BLOCKED) |
| `docs/revoke-uninstall-spec.md` | Normative teardown behavior tied to companion and case-store |
| `fixtures/required-checklist.json` | Machine-readable section names for completeness tests |
| `scripts/sanity.mjs` | Link and checklist sanity (no network) |
| `test/*.test.js` | Guide safety, checklist completeness, teardown mocks |

## Dependencies on other issues

| Issue | What packaging imports (read-only) |
|-------|-----------------------------------|
| #5 | `logout`, token custody, fixed command surface, no paid fallback |
| #7 | `deleteCase`, crypto-erase, per-case isolation |
| #9 | Transfer is user-only; guide references authorized transfer, not automation |
| #12 | Trust interruptions copy defers to product UI; packaging does not duplicate UI strings |
| #14 | Release evidence and live observer runs |

Packaging tests reach into `../companion` and `../case-store` only through their public
`src/` exports and test fakes. No edits to those directories from this branch.

## What stays BLOCKED

- Three nontechnical users on permitted real cases (#3 route, institution approval).
- Managed Chrome distribution, code signing, or store submission.
- Live Sign in with ChatGPT registration without a supported account (companion auth-route B1–B3).
- Claiming a ten-minute setup time before observed timings exist.

## Verification

```bash
cd packaging
npm run build
npm test
```

CI runs the same commands on pull requests that touch `packaging/**`.
