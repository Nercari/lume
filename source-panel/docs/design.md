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
| Quote accuracy | `none`, `exact`, `mismatch` | Each quoted span (`"..."` or `“...”`) in the draft section is matched to the cited page that contains it. See below. |
| OCR reliability | `not_applicable`, `reliable`, `low_confidence`, `no_confidence`, `missing_method` | #2 `canSupportDecisive` when `method` is a non-empty string. A missing or blank `method` does not throw. |
| Semantic support | `uninspected`, `supports`, `partial`, `does_not_support`, `review_stale` | Only a human review. `recordReview` accepts only the #8 `USER_ACTION` symbol. The review keeps the claim and passage text it saw. If either changes, the review is `review_stale`. |

A literal string match sets only the quote axis. Quotes are attributed across the passages the
section cites, not required on every one of them:

- `exact` when this page contains at least one quote and every quote in the section appears on
  some cited page in that section.
- `none` when this page contains none of the quotes and every quote appears on another cited page.
  That citation was not quoted. It is not `quote_mismatch`.
- `mismatch` when any quote appears on no cited page in the section. Every citation in the section
  gets `mismatch`, so none of them can become `verified`.

A citation is `verified` only when the source is found and current, the quote is `exact` or
`none`, the OCR is `reliable` or `not_applicable`, and a human review says `supports`. All other
combinations get an honest status: `not_found`, `stale`, `quote_mismatch`, `ocr_unreliable`,
`not_supported` or `unverified`. An entry is `verified` only when all its citations are
`verified`. A missing or blank passage `method` sets the OCR axis to `missing_method` and the
status to `ocr_unreliable`, including after a human `supports` review. `checkCitation` does not
throw.

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

- The case id and the open case number (any format, CNJ or not) are required. `research` refuses
  the query when either is absent. `caseTermsOf(L, { caseId, caseNumber, extra })` collects
  document IDs from the ledger, the case identity, and the terms the caller names.
- Callers must pass known party names. The ledger has no party names, and this module does not
  discover them. Free-text addresses are not stripped. A known address has to be passed in
  `caseTerms` if it must not be sent. Minimization is not address redaction.
- `minimizeQuery` folds case and accents, then removes CNJ case numbers, CPF, CNPJ, e-mail,
  passage references, runs of 6 or more digits, and each case term, when they sit on a word
  boundary. Statute numbers such as `8.112/1990` stay.
- `research` checks the result again with `leaks`. A case term that remains is refused. A case
  number, CPF, or CNPJ shape that remains is also refused, including one glued to a letter so the
  boundary stripper missed it. An empty query is refused. `research` throws `QueryLeakError` and
  sends nothing. The diagnostic log keeps the sent query and the kinds removed, never the removed
  values.
- Each result becomes a record: `source` (title, URL, official), `checkedText`, `currency`, and
  `relevance` (issue, assessment, reviewer). Currency is `current` only when the source says
  `in_force` and `asOf` is a parseable time at or before the check, within the max age. An
  unparseable `asOf` is `invalid`. A time after the check is `future`. Missing status or `asOf` is
  `unknown`. Any other stated status is kept (`revoked`, `stale`, ...), with `asOf` and
  `checkedAt`. A record is `unverified` until a person calls `assessRelevance`. It is `verified`
  only for an official source whose currency is `current`, with checked text the person found
  relevant. `invalid` and `future` stay unverified (`currency_invalid`, `currency_future`).

## 4. Use of #2, #6 and #8 (read-only imports)

- #2 `extraction/`: `openSource` (document ID, version, page, excerpt, link, OCR image and its
  retention status), `canSupportDecisive`, and `parseRef`. A passage with no `method` is read from
  the stored extraction record, because `openSource` throws on that field.
- #6 `analysis/`: the ledger (`findings`, `passages`, `stale`, `rejected`), `GateError`.
- #8 `chat-editor/`: `buildContext` and `sourcePanel` for the draft entries, `USER_ACTION` for
  the review gate.

## 5. Limits

- Reviews are a plain object that the caller stores (for example as a #7 checkpoint).
- The caller must pass every known party name and any other known sensitive term. A sensitive fact
  that is not a passed term or an identifier shape is not detected. Free-text addresses are not
  stripped. Real-case validation needs #3.
- Quote matching is literal. A paraphrase is not a quote. A citation whose page does not contain
  the section's quote gets `none` when another cited page does, and `mismatch` when no cited page
  does. `mismatch` is never `verified`.
