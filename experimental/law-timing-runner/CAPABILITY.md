# Capability and approval proposal (not an approval)

Nobody has approved this. No activation command has been run. The owner's confirmation at action time is
required before any future enablement. Independent review of the exact head comes first.

## Reviewed code

- Package: `experimental/law-timing-runner/lume_timing`
- Code hash (`lume_timing.grant.package_hash()`, sha256 over the package `.py` and `.yaml` files):
  `4fd4eb963c5f9483aec44d9e954f3df76ea6b233130038e698c66942c7e396d1`
- A grant names this hash. If any package file changes, the hash changes and the grant is refused with
  `grant_stale_code`. A test compares this document with the live hash.

## Proposed change (one capability)

- Plugin: `lume-timing` (Law profile only).
- Toolset: `lume_timing`. New tool: `lume_timing_run`.
- Capability: run a bounded, synthetic or development-case timing unit through a fixed argument vector,
  with no shell, and write an aggregate and opaque receipt under the Law output root.
- **A production execution backend does not exist in this change.** Enabling the plugin alone runs
  nothing. A separate, later review must add and approve a backend.

## Unchanged

- Terminal stays disabled in Law. No blanket terminal grant.
- Denied tools stay denied: terminal, code_execution, browser, computer_use, delegation, cronjob,
  image_gen, tts, vision.
- No settings edit, no access widening, no account change, no deletion, no merge.
- All four gates stay UNMET until each owner verifies them. Law owns legal veto approval.

## Grant parameters (hard ceilings in code)

| Parameter | Ceiling |
| --- | --- |
| Case IDs per call | 3 |
| Iterations per call | 2 |
| Timeout per call | 600 s |
| Runs per grant | 3 |
| Units per grant | 6 |
| Grant lifetime | 24 h, then expires |
| Models | claude-haiku-5-5 or claude-sonnet-5-5, pinned in the grant |
| Concurrency | 1 |

## Privacy and billing exclusions

- Only opaque development IDs from a hash-bound allowlist. Held-out and OCR-excluded IDs are refused.
- No real case, private Law material or credential file is read by this prototype or its tests.
- The shared result holds counts, timings and an opaque receipt ID. No prompt, source text, path or
  subprocess stderr.
- Subscription only. API key, auth token, custom base URL, Bedrock, Vertex, Foundry, model fallback and
  `--bare` are all blocked. No paid API spend.
- No network request and no provider call from the prototype or the tests.

## What is not proven

Plugin installation is not OS isolation. A subscription claim from a fake backend is not proof. See
the known gaps in `README.md`.

## Before any future action

1. Independent reviewer tests this exact head.
2. A backend with a real provenance check is built and reviewed in a separate change.
3. The four gates are VERIFIED by their owners.
4. The owner confirms at action time. Then, and only then, an operator installs and enables.
