# License and attribution checklist

Part of #13. Complete before any public release artifact. License text itself is chosen by the
maintainer; packages today use `UNLICENSED` in development.

## Primary license

- [ ] SPDX identifier recorded in root or `MANIFEST.txt` header in the install bundle
- [ ] Full license text shipped in `lume-install/LICENSE` (or equivalent)
- [ ] Source offer complies with chosen license if binaries are distributed

## Third-party runtime dependencies

| Component | Dependencies | Attribution action |
|-----------|--------------|-------------------|
| `extension/` | None at npm level. `dist/manual/` copies pdfjs-dist, tesseract.js, tesseract.js-core, and `@tesseract.js-data/por` from `manual/` | Name those licenses in `THIRD-PARTY-NOTICES` |
| `chatgpt/` | None | Markdown instructions only |
| Other packages | See each `package.json` | Copy notices into `THIRD-PARTY-NOTICES` when deps exist |

Re-run this table when `package-lock.json` files gain production dependencies.

## ChatGPT manual workflow

- [ ] User-facing docs cite OpenAI as the inference provider when users paste packages
- [ ] Link to OpenAI terms and privacy policy (URLs from official docs, not scraped content)
- [ ] No implication that OpenAI endorses the court deployment

## Chrome extension platform

- [ ] Acknowledge use of Chrome extension APIs per Google terms

## Sample and evaluation separation

- [ ] `lume-install/` contains no real case PDFs, exports, or private manifests
