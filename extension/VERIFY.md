# Verify the ChatGPT-plan run

Live inference stays blocked until Pedro signs in on his own ChatGPT plan. Do not point these checks at api.openai.com and do not use a real case.

## What this worktree ran

From `extension/`:

```
npm install
```

```
added 1 package, and audited 2 packages in 488ms

found 0 vulnerabilities
```

```
npm run build
```

```
build: dist/ ready (3 manifest refs ok, manual/lume-pdf.html)
```

`dist/metodo/` is a byte copy of the flattened plugin (`jef-director.md`, `jef-pacote.md`, `jef-relatorio.md`, `jef-voto.md`, `jef-revisao.md`, and the other project files).

```
npm test
```

```
ℹ tests 89
ℹ suites 0
ℹ pass 89
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 24644.62343
```

From the repo root:

```
node --test --test-reporter=spec packaging/test/guides.test.js
```

```
ℹ tests 4
ℹ pass 4
ℹ fail 0
```

The 89 extension tests include the synthetic SSE cases, the 401 single refresh, forbidden parameters, resume after quota and cancel, the lossless passage split, coverage mismatch as INCOMPLETO, method byte equality, the sigilo warning, and the local Playwright run (50 synthetic documents, no court site, no model call).

## Not run

- Sign in, model discovery, or `POST /v1/responses` on a real ChatGPT account.
- Logout, revocation, and refresh-token rotation. The worker owns refresh. This page only sends `lume:siwc-access`.
- A managed-workstation install.
- A real case. Fixtures use labels such as `TEST-CASE-A` and `D1`.
