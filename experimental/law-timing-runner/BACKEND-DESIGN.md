# Law timing backend and provenance: design only

Card t_ec957c8e, PR #62. Stage: DESIGN/REVIEW ONLY. Base head: `6c1c146`.

This file is a design. It is not a backend, not a permission and not a readiness claim.
No runtime code was changed. The runtime package hash is unchanged
(`4fd4eb963c5f9483aec44d9e954f3df76ea6b233130038e698c66942c7e396d1`, see `CAPABILITY.md`).
The tool stays uninstalled and unenabled. All four gates stay UNMET.
A design PASS does not convert into readiness, permission, legal approval or a benchmark claim.

Status words used below:

| Word | Meaning |
|---|---|
| STATIC | Visible by reading the code in this PR. |
| SYNTHETIC | Covered by an invented offline fixture. Shows a contract shape, not a fact about the world. |
| UNPROVEN | A later stage could prove it. Nothing in this stage does. |
| UNKNOWN | No source in this stage tells us the fact. |

## 1. Trust-boundary map

The chain that does not exist yet: inert Law tool (`lume_timing.runner`) -> bounded local executor
-> subprocess transport (`lume_timing.process.run_bounded`) -> `claude` CLI -> inference service -> provenance receipt.
Today `runner.py` is not wired to `process.py` (STATIC: a test asserts `runner.py` has no `subprocess` and no `from .process`).
`Runner(None)` returns `not_configured` and `check_fn` hides the tool.

| Field | Who can attest it | Today | Does NOT prove it |
|---|---|---|---|
| Grant hash, caps, expiry | A signer outside the same-UID actor | Unsigned JSON grant. Plain-JSON ledger. STATIC. Same-UID tamperable. | A hash in a file the actor can rewrite. |
| Code hash | The package-hash check (STATIC). A future launcher binds it to the grant. | Grant carries `code_hash`. SYNTHETIC binding in `design/`. | A hash the executor reports about itself. |
| Input manifest hash | The manifest loader (STATIC) | Verified before spawn. | Source content is right for Law. |
| Executable and version | A fixed path plus a pinned digest, checked by the launcher | UNKNOWN. No binary is chosen or pinned. | `--version` text printed by the binary. |
| argv, env | The launcher builds them. The caller cannot. | `build_claude_argv` and `child_env` (STATIC). | Anything about what the binary does with them. |
| Auth mode (subscription or API) | A trusted host status read, not the model and not the receipt | UNPROVEN. `check_auth_status` checks a dict someone supplies. | `authMethod`, `subscriptionType`, `api_key_source` in CLI JSON. A model sentence. |
| Zero billing fallback | Provider-side billing record, or a network egress policy | UNKNOWN. Nothing in this stage can observe it. | `total_cost_usd`, `fallback_used`, a config pin, a fake receipt. |
| Executed provider and model | An independent attestor with its own key | UNPROVEN. SYNTHETIC shape only. | `requested_model`, `executed_models` or `model` in the CLI's own output. |
| Timing | The harness clock | SYNTHETIC_PROXY. | See section 6. |

Rule: a field counts only when the component in column 2 produced it. Everything the CLI or the model says
about itself is data to compare, never evidence.

Three levels stay apart in every report:

1. Static verification. Read from code (this PR).
2. Synthetic contract coverage. Offline fixtures in `design/` and `tests/`. Shows the verifier rejects what it should.
3. Future runtime proof. Needs a real binary, an attestor and an operator-confirmed run. Not done. Not authorized.

## 2. Narrow production contract (fail closed, not reachable)

This is the contract a later stage would have to meet. Nothing here is implemented in `lume_timing`.

1. Fixed binary at one absolute path, pinned by digest and version. No `PATH` lookup. UNKNOWN today.
2. Fixed argv from `build_claude_argv(model)`. No shell. A model outside `ALLOWED_MODELS` is refused. No `--bare` (it disables OAuth) and no fallback model.
3. Sanitized env limited to `CHILD_ENV_KEYS`. Any `ANTHROPIC_*`, `CLAUDE_CODE_USE_*` or listed billing key is refused, not stripped silently.
   No API-key, base-URL, Bedrock, Vertex or Foundry route.
4. No caller-configured executable, env or endpoint. The launch spec has two fields, `argv` and `env`. A third field is refused.
5. The auth decision comes from a trusted host status source, never from model text and never from the receipt.
6. An independent provenance receipt (kind `inference_provenance`) is required. It names the executed model and binds `run_id`, `grant_hash`, `code_hash` and `manifest_hash`.
7. Reject: missing, unsigned, forged, tampered, unknown-key, conflicting-model, wrong-binding, stale, future, replayed and unlabeled receipts.
8. A reject after reserve still settles the ledger (existing behavior, STATIC).

What cannot be established offline:

- That inference ran at the named provider, on the named model, billed to the subscription. No offline check can see this.
- That the test key means anything. The key in `design/provenance_contract.py` is invented and sits in the repo.
  A MAC made with a key the verifier's own process holds is a consistency check. It is not cryptographic attestation of anything outside the process.
  Unsigned JSON is not attestation, and signed JSON with a repo-held key is not attestation either.
- Which `claude` binary and version exist on the target machine.
- Whether a fallback to API billing happens under some failure path of the real CLI.

Evidence a later stage needs (none is requested now):

- A key custodian or verifier outside the executor's UID, with a public key or verification endpoint the Law tool pins.
- A real receipt format from that attestor, replacing the invented `design-hmac-sha256-test-only` shape.
- A pinned binary digest and version, and a trusted auth-status read path.
- A provider-side or egress-side signal for billing route. If none exists, the claim "zero billing fallback" stays UNPROVEN and the report must say so.

## 3. Two kinds of evidence

| Kind | Source | Answers | Cannot answer |
|---|---|---|---|
| Coding-agent subscription evidence | `claude` CLI output, host auth status | Which login the CLI session claims | Where inference ran. Whether billing fell back. |
| Backend inference provenance | An independent attestor | Which provider and model executed, for which grant, manifest, code and run | Whether the coding-agent session was subscription-based. |

They are not interchangeable. The design verifier rejects the existing coding-agent receipt shape as `wrong_evidence_kind`,
and rejects subscription or cost fields inside a provenance receipt as `untrusted_field`.
Model labels in fixtures are the installed allowlist contract values (`ALLOWED_MODELS`) or invented test labels.
They do not claim that a model exists or ran.

## 4. Production gaps (dependencies or alternatives, not fixes)

| Gap | Status | Dependency or narrow alternative | New explicit authorization needed |
|---|---|---|---|
| `runner.py` not wired to `process.py` | STATIC | A wiring change plus a new package hash and a new grant. | Yes: implementation authorization and review. |
| Unsigned grants, tamperable ledger | STATIC | Signed grant verified against a pinned public key. Ledger on storage the actor cannot write. | Yes: key custody and storage choice. |
| Ancestor-path race (parent directory swapped after check) | STATIC | Open by directory file descriptor, or run under a path the actor cannot rename. | Yes: implementation. |
| `setsid` escape (descendant leaves the process group) | STATIC | A cgroup or PID-namespace kill scope. | Yes: OS-level change. Named only. |
| Invalid stdin type caught after spawn | STATIC | Type-check `stdin` before `Popen`. Small fix, still a runtime change. | Yes: runtime change. |
| Same-UID trusted-actor limit | STATIC | A separate UID or container for the executor. | Yes: security and access change. |
| Profile-scoped does not mean isolated | UNPROVEN | Test isolation from outside the profile. | Yes. |

Narrowest alternative that avoids a new service: a separate-UID launcher that holds the grant verification key, builds argv and env,
and writes the ledger. It still needs an attestor for section 3. Both need explicit authorization and the operator's action-time confirmation.

## 5. Offline synthetic evidence matrix

Module: `design/provenance_contract.py`. Run:

```
cd experimental/law-timing-runner
PYTHONPATH=. python3 -m design.provenance_contract
PYTHONPATH=. python3 -m unittest tests.test_design_provenance
```

Label: `SYNTHETIC_DESIGN_CONTRACT_EVIDENCE`. These are design contract checks. They are not provider responses and not live measurements.
The module imports only `hashlib`, `hmac`, `json` and `lume_timing` constants. It starts no process, opens no socket and reads no file or account state.
`tests/test_design_provenance.py` patches `subprocess.Popen` and `socket.socket` to raise, and checks the imports by AST.
`verify_envelope` returns `production_trust: False` on accept too.

Result at this head: 35 cases, 35 passed, 3 accept, 32 reject, exit 0. Output hash: `05e36fa4c3d7b27e5e0cf3ff12b9e61d92c29d3af9920a75ab9157930adf0c4a` (repeatable).

| Group | Accept | Reject cases |
|---|---|---|
| Provenance receipt | consistent signed fixture (1) | unsigned complete JSON, non-object attestation, forged MAC, body changed after signing, unknown key id (5) |
| Fabricated claims | | coding-agent subscription evidence, self-reported subscription field, CLI cost field, missing field, `synthetic` not True (5) |
| Model | | invented label, executed differs from requested, model differs from grant (3) |
| Binding and freshness | | wrong grant, code, manifest, run id; stale; future; replayed run id (7) |
| Launch contract | fixed argv and clean env (1) | caller executable, endpoint, shell flag, extra argv, string argv, API-key env, base-URL env, Bedrock env, unlisted env, invented model (10) |
| Auth source | trusted host status (1) | model text, receipt self-report (2) |

Full Python suite at this head: 105 tests (98 existing, 7 added), OK, run 3 times. JS: 26 (voto harness) and 35 (plugin) pass.

What the matrix shows: the verifier shape rejects forged, fabricated and conflicting input.
What it does not show: that any real receipt would be unforgeable. The test key is public.

## 6. Finite next-step dependency list

Can proceed now as design:

1. Reviewer inspects this exact head (`mcp:3622f3f0-5dbb-4e2a-a3ca-1e5085108988`). No self-approval.

Needs implementation authorization and review later:

2. Wire `runner.py` to `process.py` behind the contract in section 2.
3. Signed grant, protected ledger, `stdin` type check before spawn, ancestor-path fix.
4. OS-level kill scope for `setsid` descendants.

Needs the operator's action-time confirmation for a future narrow capability:

5. Any run of a real `claude` binary, any auth read, any provider call, any install or enable.

Needs an external party or source (named, not requested):

6. A key custodian or verifier for inference provenance. A pinned binary digest and version.
   A trusted auth-status source. A billing-route signal, if one exists.

Needs Law's own acceptance:

7. Law owns legal veto approval and the acceptance of any benchmark or readiness claim. Terminal stays disabled in Law.

Held, unchanged: the four gates (`independent-evaluator`, `law-vetoes`, `heldout-isolation`, `case-readiness`) stay UNMET.
Hillclimb baseline and climb stay ON HOLD. Smoke timings stay UNCONFIRMED. Edit burden stays UNMEASURED.

Timing kinds stay separate. CLI-pipeline timing (a backend run, SYNTHETIC_PROXY here) is not Chat upload-to-final-voto timing.
Neither is measured by this stage. No baseline, improvement or speedup claim follows from this design.

## 7. Sources

`lume_timing/subscription.py`, `runner.py`, `process.py`, `grant.py`, `gates.py`, `contract.py`, `CAPABILITY.md`, `README.md`,
`tests/support.py`, `tests/test_process.py`, `tests/test_bounds.py`, `tests/test_subscription.py`, and the checked brief
`backend-design-brief.md` (the `check_brief.py []` result is the requester's statement; the script was not available to this session).
