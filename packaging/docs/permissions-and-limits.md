# Permissions, plans, quotas, data, and limits

Part of #13. Copy suitable for staff handouts and release notes. Wording tracks `extension/`,
`companion/`, and `case-store/` behavior as of the pinned commit in `RELEASE-PIN.txt`.

## What Lume may access

| Surface | Access | Why |
|---------|--------|-----|
| PJe TRF1/SJDF first instance | Read document list in the open tab, same as you | Core inventory (#4) |
| Side panel | Show status and controls next to PJe | UI |
| Sign in with ChatGPT (via companion) | OAuth tokens for allowed model calls | Analysis and chat (#5, #8) |
| Local encrypted storage | Case inventory, drafts, chat for cases you open | Resume work (#7) |

Lume does **not** request broad tab access, cookie export, certificate access, or permission to
drive the PJe editor without your explicit transfer action (#9).

## ChatGPT plan eligibility

- Lume uses **Sign in with ChatGPT** with your work or personal ChatGPT login, only if your
  organization permits it.
- The companion checks that granted scopes include **ChatGPT plan usage**. Accounts without that
  capability pause with a clear message. There is no alternate “bring your own API key” path.
- OpenAI preview limitations may apply; see their official “preview limitations” page linked from
  `companion/docs/auth-route.md`.

## Quotas and usage limits

When shared plan usage is exhausted, Lume **pauses** the case and keeps your local work. It does
not silently switch to paid API credits. Resume when your plan allows more usage or after the
period resets, per OpenAI’s documentation.

## Data handling

| Data | Where it lives | How long |
|------|----------------|----------|
| PJe session | Chrome, same as today | Until you sign out of PJe |
| Model tokens | Companion OS vault + short-lived memory | Until logout/revoke (#5) |
| Case content | Encrypted in this browser profile | Until you delete the case, uninstall, or TTL expiry (#7) |
| Diagnostics | Counts and redacted errors only | No draft or chat text in logs |

Case data does **not** sync to Lume’s GitHub, CI, or other users’ machines by default.

## Supported PJe scope

- **In scope:** `https://pje1g.trf1.jus.br/pje/*` (TRF1/SJDF, first instance).
- **Out of scope today:** Second instance (`pje2g`), other tribunals, and pages whose layout
  does not match the calibrated selectors (the extension stops safely).

## Known limitations

- Selectors and layout checks are verified against permitted real cases only when #3 and #4
  complete live calibration. Until then, an unexpected PJe change may stop reads.
- Sign-in registration for open-source projects may require maintainer approval from OpenAI
  (**BLOCKED** until a live attempt succeeds).
- OCR quality metrics (#2) gate whether scanned PDFs are trusted; poor scans may yield gaps.
- Decisive legal conclusions without sources stay provisional (#6, #10).
- Only drafts marked conclusive through the editor may be offered for authorized transfer (#8, #9).

## Privacy and evaluation separation

- Public GitHub content must pass the intake linter: no party names, case numbers, or tokens.
- Real case work stays on the permitted workstation route (#3). Observer study notes use opaque
  IDs only when published.
