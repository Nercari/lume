# VERIFY

This file is the merge evidence for this repo. Update it in the same PR when behavior changes.

## Commands

- Test one package: `npm test --prefix <package>` (packages: intake, companion, extension, case-store, extraction, analysis, chat-editor, source-panel, transfer). Packages that import `extraction` need `npm ci --omit=optional --prefix extraction` first.
- Hosted CI runs the same package tests in the per-package workflows under `.github/workflows/`.

## Essential check

GREEN for a merge: `hq_onboard_repo.py merge N --repo Nercari/lume` runs these commands on main with the PR head merged in and posts `verify/essential`. They are offline, finish in seconds, and need no installed dependencies. The unit tests run in each PR's own PROOF CMD and in hosted CI, not here.

```
npm run build --prefix intake
npm run lint:public --prefix intake
npm run build --prefix companion
npm run build --prefix case-store
npm run build --prefix extension
```
