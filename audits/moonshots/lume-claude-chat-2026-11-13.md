# Moonshot audit: lume-claude, the Lume plugin for Claude Chat

Audit record only. It changes no code. Implementation changes are in commit b2b3f74 on PR #62 and are listed as evidence, not as part of this record.

## 1. Scope

Audited: `plugins/lume-claude` at head b2b3f74b59e9fe9b9c059cf42c0ca69f03a15aea (branch `grok/integrate-pedro-plugin`, PR Nercari/lume#62), built from Pedro's Lume ZIP. Question: will it install and work in **Claude Chat** (claude.ai web and the Chat tab in Claude Desktop), and what should change? Not asked: Cowork or Code quality, the PJe plugin `plugins/lume-jef`, legal content of the skills.

Brief: Hermes/Ops/Vex message of 2026-11-13, "Continue Pedro's Lume Claude plugin request on this existing owned thread and PR #62", with Cipher's correction of the same day: the primary target is Chat, not Code or Cowork. Run ID `lume-claude-20261113T185757Z-fd8b0c59`. Run directory: `/home/nercari/.hermes/workspace/lume-claude-delivery/lume-claude-20261113T185757Z-fd8b0c59/` (call it RD below).

## 2. Part A: method

**Population.** One plugin tree: 161 files, 12 skills (`jef-director`, `jef-estilo`, `jef-inicio`, `jef-lote`, `jef-materias`, `jef-pacote`, `jef-pesquisa`, `jef-relatorio`, `jef-revisao`, `jef-triagem`, `jef-voto`, `jef-work`). Command: `find plugins/lume-claude -type f | wc -l`.

**Sample.** All of it. No sampling.

**Method.**
1. Verify source fidelity: ZIP SHA-256 ff0f788c…67ee, safe extraction, byte comparison (RD/01-fidelity.log).
2. Read the official Chat page and the linked plugin reference. Record documented and undocumented facts (RD/format/official-docs-evidence.md).
3. Build the Chat artifact with `node plugins/scripts/build-lume-claude.mjs`.
4. Council round 1 on a Code-target packet. Cipher then corrected the target. Round 1 is superseded for Chat and kept only as history.
5. Council round 2 on a Chat-target packet (v2). Each member got the same packet and prompt, with tools off. Save each output as received.
6. Triage each council claim against the real tree. Apply, defer or reject, with a reason.
7. Re-run tests and checks on the changed tree.

**Council evidence rules kept.**
- The three members read one packet. They are **one input, not three confirmations**: they share the packet's premises, including its gaps. Where they agree, that shows the packet's shape, not independent proof.
- Outputs are verbatim, with the receipt for each. No score was invented.
- A premise that changed after the spawn (the target) was sent as a new round with a new packet. Round-1 figures are not used for Chat conclusions.

**Classes.** FIXED (applied, with a test); DEFERRED (kept for a live Chat result or a Pedro decision); REJECTED (reason given); UNVERIFIED (no command can settle it without live Chat).

### Council receipts

Task IDs use the form `node:delegated-task:command%3Amcp%3A609e957f-f544-4cc2-84bd-e838c1a03726%3Adelegate-task%3A<uuid>`.

| Round | Member | Provider / model | Effort | Task uuid | Status |
|---|---|---|---|---|---|
| 2 (Chat) | m1 | claudeAgent / claude-fable-5-2 (executed: claude-fable-5-2) | effort=high | 13bdcedd-6c60-410b-bf31-35488df5ec01 | completed |
| 2 (Chat) | m2 | opencode / opencode/beam-free (executed: not reported) | variant=high | eb6f5736-172b-4eb6-83cf-71f46d0de1e6 | completed |
| 2 (Chat) | m3 | opencode / opencode-go/deepseek-v4.1-flash (executed: not reported) | variant=high | 4bfd16ba-799d-4bd1-8f02-838e6ee60981 | completed |
| 2 (Chat) | m4 | opencode / opencode/big-pickle | - | - | **NOT LAUNCHED** |
| 1 (Code, superseded) | m1 | claudeAgent / claude-fable-5-2 | effort=high | 2c17342a-43db-4d29-85f8-3576ea9075e5 | completed |
| 1 (Code, superseded) | m2 | opencode / opencode/beam-free | variant=high | 9d6bb255-252b-4995-a033-fbaec3b92a92 | completed |
| 1 (Code, superseded) | m3 | opencode / opencode-go/deepseek-v4.1-flash | variant=high | 9a366902-c6a9-4c0c-bb3e-97e9e8e3649d | completed |
| 1 (Code, superseded) | m4 | opencode / opencode/big-pickle | - | - | **NOT LAUNCHED** |

m4 was refused by the paid-model allowlist hook in round 1. It was not retried and no paid model was used, so the council has three members, not four. **Remaining acceptance: one more independent council result (for example a Claude-pool model other than m1, or an allowed free model) over the round-2 packet. Nobody has run it.**

Hashes (sha256):
- RD/council/evidence-packet-v2.md 024e80a5303f0ff4175e2ca9a0ebce31dccf24564b1af770251cc8a5fe64af4c
- RD/council/round2-prompt.md 56144fe7eec82e477b58a8c602b9149e64c2a257a75bca00033b2633c64b5b0d
- RD/council/outputs-round2.md b0ee52681d3f0e05de0f4b2af86ab63720cb4da15752451f7cd80271df304635
- RD/council/outputs-round1.md c39ca619cbd4f73ec26ebe3f2fbdcf92c7334cabaaddb20f457fbf0505d26249 (superseded)
- RD/council/evidence-packet.md eb6b92cfec2b0aec900be706412c1efcd8824e7a26534940684d30ae1166ec89 (superseded)
- RD/council/round1-prompt.md 61911ae01e0c393edb3f8ccab51fe2ddc13a90874bbf63a59759c2331d4565fa (superseded)

## 3. Part A: results

### Evidence numbers

| # | Command | Result |
|---|---|---|
| E1 | `cd plugins && node --test test/*.test.mjs` | tests 34, pass 34, fail 0, skipped 0 (re-run in this session) |
| E2 | `claude plugin validate plugins/lume-claude --strict` (RD/05-install-newtree.log) | passed; install into an isolated project: 12 skills, version 1.2.0 |
| E3 | `sha256sum RD/chat/lume-claude-chat.zip` | 4b47bb5a7c028ab46a5b7479f92d1ec9e0170ffe334cb2db3b8ca65ee96a2f74; 161 entries |
| E4 | path audit (RD/chat/path-audit.txt) | 110 non-empty lines; "NO count: 0" |
| E5 | `gh pr view 62 --json statusCheckRollup` | 12 checks, 12 SUCCESS at head b2b3f74 |
| E6 | `grep -rn 'CLAUDE_' plugins/lume-claude` | 1 hit: `LEIA-ME.md:3`, prose that says the skills use no such variable; none in skill folders |
| E7 | `grep -rln '1\.1\.5' plugins/lume-claude` | no hits; the shipped manifest and `LEIA-ME.md` both say 1.2.0 |
| E8 | RD/06-chat-sandbox-sim.log | SIMULATION of a skill-folder-only sandbox: label closure "ok". A simulation is not Chat. |
| E9 | RD/workflows/07-smoke-newtree.json | Haiku smoke run in **Code**: success, 4 turns, skill loaded |

### Findings

Links are to files and commits in this repo. All were read, not assumed.

| ID | Class | Claim (council source) | Link | Evidence |
|---|---|---|---|---|
| F1 | FIXED | `closeModules` copied modules only by file name. Citations by label (`C<n>`, "contrato", "perfil") left skills without `c<n>.md`, `contrato.md`, `profiles.md`. (m1 §1, m3 §2) | `plugins/scripts/build-lume-claude.mjs` (`citesByLabel`), commit b2b3f74 | E1 (two new tests), E8 |
| F2 | FIXED | The path rewrite produced a malformed `` `skill `jef-x`` `` when the source token was already in backticks. (m1 §2) | `build-lume-claude.mjs` (exact-once edits for `jef-materias`, `jef-triagem`), `plugins/test/claude.test.mjs` | E1 |
| F3 | FIXED | `tools.md` told the model to "resolve the skill directory from the environment" and ran `python x.py`. Chat has no such resolver. Fixed to skill-relative `python3 scripts/x.py` and a preflight (`import pypdf`, `which pdftoppm tesseract`) with a read-the-attachment fallback. (m1 §3.3, m2 §3.2, m3 §3.4) | `build-lume-claude.mjs` (`tools.md` edit); test "tools.md carries the sandbox preflight" | E1 |
| F4 | FIXED (wording only) | Profile persistence in Chat has no documented mechanism. `profiles.md` now says the profile comes from an attached `perfil-estilo.md` and "nada é salvo automaticamente". The feature itself is **not** proven to persist. (m1 §3.4, m3 §2) | `build-lume-claude.mjs` (`profiles.md` edit) | E1 |
| F5 | FIXED | No gate stopped Code-only tokens. A test now fails on any `${CLAUDE_*}` or cross-skill `skills/jef-` path, and checks `name` equals folder, description length, SKILL.md line count, and that every `references/` or `scripts/` path resolves in the same folder. (m2 §3.1, m3 narrow-audit note) | `plugins/test/claude.test.mjs` | E1 |
| F6 | FIXED (packet gap) | m3 said no Claude manifest was shown. The packet omitted it; the real manifest exists, has one `plugin.json`, and passes strict validation. | `plugins/lume-claude/.claude-plugin/plugin.json` | E2, E1 (upload-limits test) |
| F7 | FIXED (packet gap) | "One residual `CLAUDE_` and one `skills/jef-` path" (m1, m2, m3). The remaining `CLAUDE_` is prose in `LEIA-ME.md`, not a variable. | `plugins/lume-claude/LEIA-ME.md:3` | E6 |
| F8 | DEFERRED [J] | Make `jef-director` self-complete by inlining the `pacote`, `lote` and `estilo` instructions, so no skill needs another by name. (m1 §3.1) | - | no Chat result |
| F9 | DEFERRED [J] | Replace the 12 skills with one skill, or fold `jef-inicio` and `jef-work` into `jef-director`. (m3 §1, §3.5; m2 §1, §3.5) | - | no Chat result |
| F10 | REJECTED | Add hooks, commands or sub-agents (round-1 ideas). They do not run in Chat. | `RD/format/official-docs-evidence.md` | docs |
| F11 | REJECTED | Rewrite `lume_check.py` and `extract_pdf.py` (stale lock, UTF-8 decode). It would break byte fidelity to Pedro's source. Listed as follow-ups. | `plugins/test/claude.test.mjs` (scripts identical to source) | E1 |
| F12 | REJECTED | Add a `host.md` adapter, or delete the stub skills. Not needed once paths are skill-relative. | - | E1 |
| F13 | UNVERIFIED | Whether named skill loading ("carregue `jef-pacote`") works in Chat. All three members call it the top risk. | - | none possible without Chat |
| F14 | UNVERIFIED | Whether the Chat sandbox has pypdf, pdftoppm, tesseract, network access. C5 research needs network. | - | none possible without Chat |
| F15 | UNVERIFIED | `contrato.md` says `lume:jef-director`. Whether Chat shows that namespace is undocumented. The file is byte-identical to the source and was left alone. | `plugins/lume-claude/skills/jef-director/references/contrato.md:11` | E6-style grep |

### Judgment calls

- **[J] F8.** Alternative reading: inline the instructions now, because the cost is small (161 files against a 5,000-file limit). Not done, because it changes Pedro's skill text and no evidence yet shows named loading fails in Chat. Revisit after the live test.
- **[J] F9.** Alternative reading: one skill is safer in Chat, because it removes the cross-skill question. Not done, because it breaks 12-skill fidelity to the source and the three members share one packet. Revisit after the live test.

Two [J] marks.

### Evidence by surface

Each surface is reported alone. A result on one surface does not stand in for another.

| Surface | What was done | Status |
|---|---|---|
| **Chat** (claude.ai web, Desktop Chat tab) | Source-based design from the official page. Self-contained skill folders. Council round 2. Folder-only sandbox SIMULATION (E8). | Live upload, activation and 3 workflows: **NOT RUN**. Blocker: no authorized live Chat session; the agent does not sign in as Pedro or touch his account. User-side steps: `RD/chat/CHAT-TEST-STEPS.md`. |
| **Cowork** | Official page read only. | **NOT RUN**. Documentation only. |
| **Code** | Strict validate, isolated install, 34 tests, Haiku smoke (E1, E2, E9). | Executed. Cannot satisfy Chat acceptance. |

## 4. Part B: the moonshot

**Premise.** The plugin assumes that Chat copies each skill's own folder into a code sandbox and resolves skill-relative paths there, and that one skill can load another by name. The first is documented. The second and the toolchain are not.

**Cut.**
- Code-only path variables and cross-skill paths. Done (F1, F5). Owner type: T3 thread. Smallest test: the self-contained test in `claude.test.mjs`; judge: CI; pass = 0 hits.
- (Proposed) The stub text that points other skills at `../SKILL.md`. Not cut; the council did not agree on it and it is harmless. Owner: Pedro, after the live test.

**Keep.**
- The 12-skill shape, Pedro's skill text, and both scripts byte for byte (E1 test). Reason: source fidelity is a stated requirement and nothing shows the shape fails.
- `plugins/lume-jef` and `plugins/lume-workspace`: untouched.

**Add.**
- The live Chat test (`CHAT-TEST-STEPS.md`). Metric: per-step pass or fail with exact error text. Baseline: none (NOT RUN). Target: steps 2 to 6 pass. Owner type: Pedro or a session he authorizes. Smallest test: step 2, upload the zip and read the message. Pass line set before the run: plugin "lume" 1.2.0 listed, no `bin/`, size or manifest error. Judge: the Chat UI.
- One more independent council result to replace the missing m4. Owner type: Hermes. Smallest test: same v2 packet and prompt, a different model family; judge: triage against the real tree.

**Not doing.**
- Hooks, commands, agents: do not run in Chat.
- Changing the scripts: breaks fidelity.
- Claiming Chat compatibility from Code tests: forbidden by the brief.
- A live Chat run by the agent: needs Pedro's sign-in.

## 5. Not verified

| What | Why | Smallest test |
|---|---|---|
| Chat upload and activation | no authorized Chat session | `CHAT-TEST-STEPS.md` steps 0 to 3 |
| 3 synthetic workflows in Chat | same | steps 4 to 6 |
| Named skill loading in Chat (F13) | undocumented | step 4: does the model load `jef-director` by name? |
| pypdf, OCR, network in the Chat sandbox (F14) | undocumented | step 7 probes |
| `lume:jef-director` namespace in Chat (F15) | undocumented | step 3 |
| File connector and profile persistence | undocumented | step 6 |
| Cowork behavior | not run | upload the same zip in Cowork |
| Fourth council member | not launched (allowlist) | see Part B, Add |
| Council `executedModel` for the two OpenCode members | tool returned null | none; the receipt shows the requested model only |

## 6. Sources

Commands (all run in this session unless marked "earlier in the run"):
- `git rev-parse HEAD` → b2b3f74b59e9fe9b9c059cf42c0ca69f03a15aea
- `cd plugins && node --test test/*.test.mjs` → 34 / 34 / 0 / 0
- `gh pr view 62 --json statusCheckRollup` → 12 SUCCESS
- `sha256sum` on the zip and council files (values above)
- `grep -rn 'CLAUDE_' plugins/lume-claude`; `grep -rln '1\.1\.5' plugins/lume-claude`
- earlier in the run: ZIP safety and diff (01-fidelity.log), strict validate and install (05-install-newtree.log), folder-only simulation (06-chat-sandbox-sim.log), Haiku smoke (workflows/07-smoke-newtree.json)

Links read:
- https://support.claude.com/en/articles/13837440-use-plugins-in-claude and its linked plugin reference (summary in RD/format/official-docs-evidence.md)
- `/home/nercari/.hermes/skills/moonshot-audit/SKILL.md`

Other documents: RD/council/* (hashes above). Raw round-1 and round-2 outputs are stored there, not pasted here.

## 7. Decisions

Dates: none proposed. No answer means: keep the branch as it is, leave the NOT RUN items open, and start no work. Each key matches an item in `lume-claude-chat-2026-11-13.card.json`.

1. **`chat_test`: Who runs the live Chat test?**
   - A ⭐ Pedro runs `CHAT-TEST-STEPS.md` in his own Chat with synthetic content and posts the results on PR #62.
   - B Pedro authorizes a separate session that signs in for him (account access: a hard stop until he says so).
   - C Skip the live test and ship on source-based evidence only (Chat compatibility stays "not proven").
2. **`named_loading`: If skill loading by name fails in Chat, what changes?**
   - A ⭐ Make `jef-director` self-complete (F8); keep 12 skills.
   - B Merge into one skill (F9); breaks 12-skill fidelity to the source.
   - C Ship a separate Chat build and Code build.
3. **`version`: Which version does the plugin carry?**
   - A ⭐ 1.2.0 (both manifests); treat 1.1.5 in the old source README as stale.
   - B 1.1.5, as in the source README.
4. **`license_holder`: Who is the LICENSE holder?**
   - A ⭐ Pedro gives the exact holder text; the agent keeps the current text until then.
   - B Keep "Nercari" as it stands now.
5. **`name_history`: What to do with three old commits (0e33ead, 2f34ac4, 1b8ec9d) that still hold the personal name?**
   - A ⭐ Leave history as it is and record the gap (no force-push).
   - B Pedro approves a history rewrite and force-push, then the agent runs it.

Retrospective vs prospective: the 34 tests and the folder-only simulation show the tree is self-consistent. They do not show Chat works. Only decision 1, option A or B, can show that.

RESULT:
- Record: audits/moonshots/lume-claude-chat-2026-11-13.md; card: audits/moonshots/lume-claude-chat-2026-11-13.card.json
- Findings: 15 (7 fixed, 2 deferred, 3 rejected, 3 unverified); [J] marks: 2
- Council: 3 of 4 members ran; m4 not launched (allowlist); outputs and receipts saved
- Tests: 34 / 34 pass at b2b3f74; CI 12 / 12 SUCCESS
- Chat live upload, activation and 3 workflows: NOT RUN (no authorized Chat session)
- Cowork: NOT RUN
- Decisions for Pedro: 5
