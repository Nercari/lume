# Revoke and uninstall

Normative expectations for packaging tests. Live OAuth revocation is out of scope on this branch; manual ChatGPT uses no Lume refresh token.

## Case delete (#7)

**Assert D1.** `CaseStore.deleteCase` removes one case prefix from the backend.

**Assert D2.** Deleting case A leaves case B intact. Packaging test `packaging/test/revoke-uninstall.test.js`.

## ChatGPT / tokens (manual mode)

**Assert R1.** Uninstall removes the install tree; no Lume refresh token is stored on this layout.

**Assert R2.** User removes ChatGPT Project in their own account when desired (out of band).

**Assert R3.** Local `.md` packages are deleted per court policy (user action).

## Uninstall

**Assert D3.** Extension removed from Chrome.

**Assert D4.** OS uninstall script deletes `%LOCALAPPDATA%\Lume` or equivalent.

No native host registration remains after uninstall on this package layout.
