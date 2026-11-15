# Law narrow timing prototype (experimental, synthetic only)

Status: **prototype. Not installed. Not enabled. No production backend exists.**
All four Lume gates stay UNMET (`audits/hillclimb/voto-timing/gates.json`). This code makes no baseline
and no improvement claim.

## What it is

One Hermes tool, `lume_timing_run`, in its own toolset `lume_timing`. It has no shell. It accepts opaque
development case IDs and three bounded integers. The package registers inert: `register(ctx)` installs a
`Runner` with no configuration, so every call returns `not_configured` and `check_fn` hides the tool.
Execution needs a dependency-injected `Config`, which only the tests build, with a synthetic fake backend.

## Run the tests

```
cd experimental/law-timing-runner
PYTHONPATH=. python3 -m unittest discover -s tests -t . -v
```

Python 3 standard library only. Every test that uses a runner patches `subprocess.Popen` to raise, so a
test that tried to start a real process would fail. `tests/test_process.py` is the one exception: it
starts a synthetic Python child to test timeout and child cleanup.

## Layers (all fail closed, in this order, before any backend call)

1. Profile must be `law`.
2. Strict request parse: duplicate keys, NaN and Infinity, bool-as-int, unknown fields, bad ID format.
3. All four gates VERIFIED with a Nercari issue or PR link as evidence.
4. Clean environment: no API key, auth token, base URL, Bedrock, Vertex or Foundry variable.
5. Grant: exact fields, hard ceilings, bound to the code hash and the allowlist hash, not expired.
6. Allowlist: hash-bound manifest. Unknown, held-out and OCR-excluded IDs get one code, `id_not_allowed`.
7. Source files: `O_NOFOLLOW`, regular file, size cap, sha256 from the open descriptor.
8. Auth status must show a claude.ai subscription login.
9. Output directory opened by descriptor and checked to sit inside the Law root.
10. Ledger: exclusive lock for the whole run, reservation before the first unit.

## Actual limits (tested, not read from config text)

| Limit | Value | Test |
| --- | --- | --- |
| IDs per call | 1 to 3 | `test_bounds`, `test_rejection` |
| Iterations per call | 1 to 2 | `test_bounds` |
| Timeout per call | 1 to 600 s, one shared deadline | `test_bounds` |
| Grant runs and units | at most 3 and 6 | `test_bounds` |
| Grant lifetime | at most 24 h | `test_bounds` |
| Concurrency | 1. A second call gets `busy`. | `test_bounds` |
| Request size | 2048 bytes | `test_rejection` |

A crash leaves `in_flight` in the ledger. The next open counts it as spent. A restart or replay cannot
reuse an expired grant or exceed the cap.

## Known gaps (read before any approval)

- **Plugin installation is not OS isolation.** The tool runs in the Hermes process. Nothing here confines
  the process, the network or the file system. The checks are application checks.
- Grant authenticity rests on file permissions. The grant has no signature.
- A local user who can write the ledger can change it. The ledger has no tamper defence.
- A race can still change a parent directory above the Law root between check and use. The output
  directory descriptor check covers the leaf and the swap race, not every ancestor.
- The `/proc/self/fd` readlink check is Linux only.
- `process.py` holds a fixed Claude argument vector and a bounded process runner. The runner module does
  not import it, so no production execution path is reachable. The argument vector is not validated
  against a real `claude` binary. No `--bare`, no fallback model.
- A subscription field reported by a fake backend is test-contract coverage, not subscription proof.
  Every result carries `subscription_proof: false`. A real backend needs its own provenance check.
- Timings are `SYNTHETIC_PROXY`. Chat upload-to-final-voto, human review and edit burden are
  `UNMEASURED`. CLI pipeline time is kept apart from them.

See `CAPABILITY.md` for the capability proposal.
