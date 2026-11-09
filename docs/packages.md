# Lume packages

One paragraph per deployable or library package. Design depth is in each package’s `docs/` tree (or package README where noted). Issues link acceptance criteria on GitHub.

## intake (#3)

Defines the **permitted real-case route** without putting case content on GitHub: a data-flow and permission matrix, official-source citations with explicit blockers, JSON Schema for private evaluation manifests, a linter that rejects identifying public text, and a six-axis rubric whose aggregate is the weakest dimension. Read [`intake/docs/data-flow-matrix.md`](../intake/docs/data-flow-matrix.md), [`intake/docs/official-sources.md`](../intake/docs/official-sources.md), and [`intake/docs/rubric.md`](../intake/docs/rubric.md).

## companion (#5)

Implements the **smallest native-messaging host** for Sign in with ChatGPT: PKCE OAuth on loopback, framed Chrome Native Messaging, vault-backed refresh-token custody with redaction, fixed command surface, and pause states for auth, plan, and quota failures—with no paid-API fallback. Route and blockers are documented in [`companion/docs/auth-route.md`](../companion/docs/auth-route.md).

## extension (#4)

The **MV3 browser surface**: a TRF1 first-instance PJe content script and side panel that walks the document list through the page’s same-origin session, assigns every row an explicit state, stops safely on session or layout failure, and never exports credentials. Build, permissions, and read semantics are in [`extension/README.md`](../extension/README.md).

## case-store (#7)

**Isolated encrypted local state** per case: sources, conversation, drafts, checkpoints, and temp blobs with AES-GCM, namespace rules so two cases never mix, resumable pause after auth/quota/browser loss, and delete/expire that scrub diagnostics. See [`case-store/docs/design.md`](../case-store/docs/design.md).

## extraction (#2)

Turns **#4 inventory rows** into passages with document/page/offset provenance, explicit gap records for restricted or unread content, reconciliation with zero silent omissions, and OCR quality metrics (CER/WER) before any companion OCR is justified. See [`extraction/docs/design.md`](../extraction/docs/design.md).

## analysis (#6)

Maintains a **coverage ledger** over readable record, emits classified findings, invalidates stale work when inventory changes, and gates **conclusive** drafts while indispensable gaps remain—without blocking editing. Human reclassification requires actor, reason, and sources. See [`analysis/docs/design.md`](../analysis/docs/design.md).

## chat-editor (#8)

Provides **case chat and a side editor** with the maintainer’s default method (no profile setup), deterministic style checks mapped to the #3 rubric, three-way merge when regeneration conflicts with manual edits, and `presentConclusive` as the only path #9 may treat as transfer-ready. See [`chat-editor/docs/design.md`](../chat-editor/docs/design.md).

## source-panel (#10)

Powers the **source panel**: four support axes, open provenance links, quote and currency checks, minimized legal-research queries with party/case stripping, and explicit **unsupported** labels on decisive claims without inspectable evidence. See [`source-panel/docs/design.md`](../source-panel/docs/design.md).

## transfer (#9)

**Planned** package for the user-only PJe insert/replace/append controller: stale-case guards, idempotent recovery after interruption, and no model-invokable write path. Implementation is tracked in [#9](https://github.com/Nercari/lume/issues/9); when merged, design will live under `transfer/docs/`.
