# Permissions and limits (staff summary)

Aligned with `extension/`, `chatgpt/`, and `case-store/` behavior as of the pinned commit in `MANIFEST.txt` (header).

## What touches case data

| Component | Access | Purpose |
|-----------|--------|---------|
| Extension content script | Same-origin fetches in the open PJe tab | Inventory (#4) |
| Manual page (`extension/manual/`) | PDF the user selects locally | Build `.md` package |
| ChatGPT (user account) | Text the user pastes | Analysis and drafts (#5 manual) |
| Case store (when wired) | Encrypted local files | Resume work (#7) |

## ChatGPT

- Lume does **not** offer a paid API key. It does not silently switch the user to metered API billing.
- The user works in **their own ChatGPT plan** (Project instructions from `PROJETO-LUME.md`).
- Lume never receives ChatGPT tokens; nothing is stored in the extension for model access.

## Chrome extension

- Permissions: `sidePanel`, `storage` only (see `extension/README.md`).
- No Chrome native host, no broad host permissions.

## PJe

- Reading uses the authenticated browser session only.
- HTTP 403 on a document is shown as `restricted` (server refusal). List metadata alone does not block a fetch.

## Known limits

- Selector profiles are **UNVERIFIED** until calibrated on a real list layout.
- OCR quality and long PDFs may leave gaps in the package; the model must respect Lacunas in the `.md`.
