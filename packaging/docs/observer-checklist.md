# Observer checklist: three nontechnical users

Part of #13. Use this form during the user study described in issue #13. **Live execution is
BLOCKED** until the maintainer supplies three permitted users and cases through the #3 route and
#14 records release authorization.

## Study status

| Field | Value |
|-------|--------|
| Status | **BLOCKED** — no permitted users or cases assigned in this repository |
| Target users | 3 nontechnical court staff with legitimate case access |
| Observer | __________________ |
| Date | __________________ |
| Workstation ID | opaque label only (no hostname with PII) |
| Build pin | from `RELEASE-PIN.txt` |

## Before the session

- [ ] IT confirmed unpacked or managed install path matches `package-layout.md`
- [ ] Synthetic-only samples removed from desktop
- [ ] Observer timer ready (wall clock, not screen recording unless policy allows)
- [ ] User has PJe access without developer present
- [ ] Escalation contact named (IT / maintainer)

## Observer role

Do not click for the user except when measuring accessibility accommodations. Record help in the
user's words. Stop the session if real case data would enter an unapproved channel.

## Install and setup

| Step | User completed alone? | Help needed (describe generically) | Notes |
|------|----------------------|-------------------------------------|-------|
| Load extension | | | |
| ChatGPT project instructions pasted | | | |
| Pin / find side panel | | | |
| Open PJe tab | | | |

Elapsed install time: ______ minutes (desired target 10, not guaranteed)

## ChatGPT project setup

| Step | User completed alone? | Friction |
|------|----------------------|----------|
| Opened ChatGPT Projects | | |
| Pasted `PROJETO-LUME.md` into Instructions | | |
| User never pasted a token or API key | observer initialed: ____ |

## Case workflow

| Step | User completed alone? | Notes |
|------|----------------------|-------|
| Open permitted case (#3) | | opaque case id only |
| Document list appears | | |
| Analysis run or pause understood | | |

## Source inspection

| Step | User completed alone? | Notes |
|------|----------------------|-------|
| Open source panel | | |
| Follow provenance link | | |
| Understand unsupported vs verified labels | | |

## Draft revision

| Step | User completed alone? | Notes |
|------|----------------------|-------|
| Edit draft in side editor | | |
| See style or gap hints | | |
| No overwrite of manual edits | | |

## Authorized transfer

| Step | User completed alone? | Notes |
|------|----------------------|-------|
| User explicitly started transfer | | |
| Stale-case guard understood if shown | | |
| Insertion matches user intent | | |

## Remove case data

| Step | Expected (#7) | Observed |
|------|---------------|----------|
| User deleted local case store or files | scoped delete works | |
| Local `.md` packages removed per policy | no stray exports | |

## Uninstall

| Step | Expected (#7 + extension remove) | Observed |
|------|----------------------------------|----------|
| Cases deleted or expired | no readable case records | |
| Extension removed | panel gone | |
| Install folder removed | `%LOCALAPPDATA%\\Lume` or equivalent gone | |
| ChatGPT project removed (optional) | user account only | |

## Timing and friction

- Total session time: ______
- Permission prompts count: ______
- Top friction point (generic): __________________

## Failure capture

| Failure | Stage | Recoverable without developer? |
|---------|-------|--------------------------------|
| | | |

## Post-session evidence

Store completed forms in the **private evaluation** path (#3), not in git. Publish only opaque
summaries that pass `lint-public`.

**Done-when for live study:** all three users complete install → case → source → draft →
transfer → remove case data → uninstall without developer intervention, with this form filed per user.
