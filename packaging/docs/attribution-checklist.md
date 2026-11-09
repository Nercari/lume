# License and attribution checklist

Part of #13. Complete before any public release artifact. License text itself is chosen by the
maintainer; packages today use `UNLICENSED` in development.

## Primary license

- [ ] SPDX identifier recorded in root or `packaging/RELEASE-PIN.txt`
- [ ] Full license text shipped in `lume-install/LICENSE` (or equivalent)
- [ ] Source offer complies with chosen license if binaries are distributed

## Third-party runtime dependencies

| Component | Dependencies | Attribution action |
|-----------|--------------|-------------------|
| `extension/` | None at npm level | State “no bundled npm runtime deps” |
| `companion/` | Node.js standard library only | Document Node ≥ 22 requirement |
| Other packages | See each `package.json` | Copy notices into `THIRD-PARTY-NOTICES` when deps exist |

Re-run this table when `package-lock.json` files gain production dependencies.

## OpenAI Sign in with ChatGPT

- [ ] User-facing docs cite OpenAI as the authentication and inference provider
- [ ] Link to OpenAI terms and privacy policy (URLs from official docs, not scraped content)
- [ ] No implication that OpenAI endorses the court deployment

## Chrome extension platform

- [ ] Acknowledge use of Chrome extension APIs per Google terms
- [ ] Native messaging host documented as separate local software

## Sample and evaluation separation

- [ ] `lume-install/` contains no real case PDFs, exports, or private manifests
- [ ] Synthetic samples labeled `synthetic-only` and kept outside install media
- [ ] Observer recordings redacted per #3 before any GitHub upload

## Maintainer sign-off

- [ ] Legal review of license choice (**BLOCKED** until maintainer records approval)
- [ ] Attribution file reviewed against `npm run build` and `npm test` in `packaging/`
