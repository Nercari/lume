# Lume

Open-source Chrome extension to help court staff analyze one complete **PJe TRF1/SJDF** case: read the authenticated browser inventory, extract text with provenance, review gaps and sources, draft with the maintainer’s default method, and **transfer only after an explicit user action**. ChatGPT is used through the user’s own plan: paste a local **pacote do caso** into a Project or plugin configured from `chatgpt/`. The model has no write tool to PJe. Cases stay isolated. Real-case evaluation uses private maintainer materials; GitHub stays non-identifying.

Product contract, delivery order, and acceptance gates live in [issue #1](https://github.com/Nercari/lume/issues/1). Implementation tracking is [issue #15](https://github.com/Nercari/lume/issues/15).

## Install and development

- **Node.js** `>= 22` (repo packages use `node:test`; no root `package.json`).
- Each package is independent: `cd <package> && npm install && npm test`. Several packages have no runtime dependencies; `npm run build` where `package.json` defines it (for example the MV3 extension).
- **Chrome (extension):** from `extension/`, run `npm run build` and load `extension/dist/` as an unpacked extension. PJe selectors are placeholders until a permitted real case calibrates them ([#4](https://github.com/Nercari/lume/issues/4), [#3](https://github.com/Nercari/lume/issues/3)).
- **ChatGPT (manual):** copy `chatgpt/PROJETO-LUME.md` into a ChatGPT Project once; generate the case package from the extension panel (**Gerar pacote do caso**). See `chatgpt/LEIA-ME.md` ([#5](https://github.com/Nercari/lume/issues/5)).

Do not commit real case data, party names, case numbers, credentials, or client IDs.

## Package map

| Path | Issue | Role |
|------|-------|------|
| [`intake/`](intake/) | [#3](https://github.com/Nercari/lume/issues/3) | Permitted real-case intake: permission matrix, manifest schema, public linter, evaluation rubric (private sheets stay out of git). |
| [`chatgpt/`](chatgpt/) | [#5](https://github.com/Nercari/lume/issues/5) | Project instructions and optional Agent Plugin for manual ChatGPT: citation rules, piece templates, reusable commands. |
| [`extension/`](extension/) | [#4](https://github.com/Nercari/lume/issues/4) | MV3 side panel and narrow PJe adapter: paginated inventory through the page session, explicit per-item states, safe stop on layout/session change. |
| [`case-store/`](case-store/) | [#7](https://github.com/Nercari/lume/issues/7) | Encrypted per-case local store, isolation, resume after interruption, scoped delete/expire, diagnostics without secrets. |
| [`extraction/`](extraction/) | [#2](https://github.com/Nercari/lume/issues/2) | PDF/HTML/scan extraction, passage provenance, gap records, OCR quality measurement and reconciliation with inventory. |
| [`analysis/`](analysis/) | [#6](https://github.com/Nercari/lume/issues/6) | Coverage ledger, classified findings, invalidation on late evidence, provisional vs conclusive draft gate. |
| [`chat-editor/`](chat-editor/) | [#8](https://github.com/Nercari/lume/issues/8) | Case chat and side editor: default drafting method, merge conflicts, human-only gap clearance, conclusive presentation rules. |
| [`source-panel/`](source-panel/) | [#10](https://github.com/Nercari/lume/issues/10) | Citation verification, minimized legal research queries, unsupported-decisive labeling, four support axes. |
| `transfer/` | [#9](https://github.com/Nercari/lume/issues/9) | User-only PJe transfer controller (no model invoke). **Not on `main` yet** — lands with the #9 implementation PR; see tracker #15. |

Narrative detail per package: [`docs/packages.md`](docs/packages.md).

## Continuous integration

Each package under `*/` has its own workflow in [`.github/workflows/`](.github/workflows/) (path-filtered on `pull_request`). Touching one package runs that package’s job only. The [`docs.yml`](.github/workflows/docs.yml) workflow validates documentation links and runs the package test suites when root docs change.

## Live validation (honest status)

These checks were **not** run in CI or in this docs pass and remain **BLOCKED** until a maintainer supplies the permitted environment:

- Authenticated PJe TRF1/SJDF session and inventory match against a human manifest ([#4](https://github.com/Nercari/lume/issues/4), [#14](https://github.com/Nercari/lume/issues/14)).
- End-to-end ChatGPT Project workflow on a supported plan ([#5](https://github.com/Nercari/lume/issues/5)).
- Real-case extraction, analysis, draft quality, and user-only transfer on permitted cases ([#2](https://github.com/Nercari/lume/issues/2)–[#10](https://github.com/Nercari/lume/issues/10), [#9](https://github.com/Nercari/lume/issues/9)).
- Trust-boundary and installation gates ([#12](https://github.com/Nercari/lume/issues/12), [#13](https://github.com/Nercari/lume/issues/13)).

Offline unit tests in each package use synthetic fixtures only.
