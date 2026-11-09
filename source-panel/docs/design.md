# Source panel: design (#10)

Part of #10. This module shows the user whether each claim in a #8 draft has support that a
person can inspect. The draft text does not change. The code is in `src/`. The tests are in
`test/`. All fixtures are synthetic and non-legal.

## 1. Four support axes

Each citation (finding to #2 passage) is checked on four separate axes. One axis never stands in
for another.

| Axis | Values | How |
|---|---|---|
| Source existence | `found`, `stale`, `not_found` | #2 `openSource` opens the exact document version and page. `stale` when the passage left the current #6 ledger or the finding is stale. |
| Quote accuracy | `none`, `exact`, `mismatch` | Each quoted span (`"..."` or `“...”`) in the draft section must be in the cited page text (whitespace collapsed). |
| OCR reliability | `not_applicable`, `reliable`, `low_confidence`, `no_confidence` | #2 `canSupportDecisive` on the passage. The OCR page image opens with the citation while it is retained. |
| Semantic support | `uninspected`, `supports`, `partial`, `does_not_support`, `review_stale` | Only a human review. `recordReview` accepts only the #8 `USER_ACTION` symbol. The review keeps the claim and passage text it saw. If either changes, the review is `review_stale`. |

A literal string match sets only the quote axis. A citation is `verified` only when the source is
found and current, the quote is exact or absent, the OCR is reliable or not used, and a human
review says `supports`. All other combinations get an honest status: `not_found`, `stale`,
`quote_mismatch`, `ocr_unreliable`, `not_supported` or `unverified`. An entry is `verified` only
when all its citations are `verified`.

## 2. Unsupported decisive assertions

#8 `sourcePanel` marks a decisive finding that is not `inspectable` as `unsupported`. This module
replaces that mark with a label by #6 class:

- `fact`, `allegation`: `unsupported_allegation`
- `legal_conclusion`: `inference`
- `unknown`, `contradiction`: `uncertainty`

Passages that #6 rejected (for example low-confidence OCR) stay in the entry as `rejected`, with
the reason and the page image, so the reviewer can see why. `buildPanel` returns `unaccounted`:
every decisive entry with no found, current citation and no unsupported label. It must be empty.

## 3. Legal research and query minimization

The research client is injected (the approved data route from #3). This module makes no network
call. Tests use a stub client that records each query.

- `caseTermsOf(L, extra)` collects the document IDs from the ledger and the terms that the caller
  names (case number, party names). The ledger has no party names, so the caller must give them.
- `minimizeQuery` folds case and accents, then removes CNJ case numbers, CPF, CNPJ, e-mail,
  passage references, runs of 6 or more digits, and each case term. Statute numbers such as
  `8.112/1990` stay.
- `research` checks the result again with `leaks`. If a case term or identifier is still there, or
  the query is empty, it throws `QueryLeakError` and sends nothing. The diagnostic log keeps the
  sent query and the kinds removed, never the removed values.
- Each result becomes a record: `source` (title, URL, official), `checkedText`, `currency`
  (`current`, `stale`, `unknown`, or the stated status such as `revoked`; with `asOf` and
  `checkedAt`), and `relevance` (issue, assessment, reviewer). A record is `unverified` until a
  person calls `assessRelevance`. It is `verified` only for an official, current source with
  checked text that the person found relevant.

## 4. Use of #2, #6 and #8 (read-only imports)

- #2 `extraction/`: `openSource` (document ID, version, page, excerpt, link, OCR image and its
  retention status) and `canSupportDecisive`.
- #6 `analysis/`: the ledger (`findings`, `passages`, `stale`, `rejected`), `GateError`.
- #8 `chat-editor/`: `buildContext` and `sourcePanel` for the draft entries, `USER_ACTION` for
  the review gate.

## 5. Limits

- Reviews are a plain object that the caller stores (for example as a #7 checkpoint).
- The case-term list is only as complete as the caller makes it. A sensitive fact that is not a
  listed term or an identifier shape is not detected. Real-case validation needs #3.
- Quote matching is literal. A paraphrase is not a quote and gets `none`.
