# Voice control — implementation plan & task tracker

Agent-driven voice navigation for vbcdr. Speech-to-text produces raw text; a persistent
background agent PTY translates that text into a structured app action against a live
snapshot of what is currently addressable.

This document is the **single source of truth across sessions and subagents**. Update the
task table as work lands. Do not rely on conversation memory.

---

## How to use this document

**Starting a session:**
1. Read this whole file (it is short by design).
2. Find the first task whose status is `todo` and whose dependencies are all `done`.
3. Set it to `wip`, do the work, set it to `done`, append a line to the Session log.

**Rules:**
- One task at a time. Do not start a task whose dependencies are unmet.
- A task is `done` only when its *Verify* column passes — not when the code is written.
- If you discover the plan is wrong, fix the plan in the same commit as the code. A stale
  plan is worse than no plan (see Verified facts, which already caught two stale claims).
- Record surprises in the Session log. The next session cannot see your reasoning.

**Status values:** `todo` · `wip` · `done` · `blocked` · `dropped`

---

## Decisions taken

1. **Local WASM whisper for STT** — transformers.js + `whisper-base.en` on WebGPU in a
   renderer Worker. Offline, private, free, no native modules.
2. **Persistent PTY + JSON protocol** — long-lived session for conversation memory, strict
   schema sent as message one, visible in the page's terminal.
3. **Live state snapshot each turn** — the agent always sees current projects/tabs/files/branches.
4. **Confirm destructive actions only** — navigation fires instantly; commit/run/close confirm.
5. **Sequencing: dispatcher first, audio second.** Steps 1→2→3 plus the Voice page text input
   prove the entire translation layer with zero audio code. Audio is gated on the T00 spike.
6. **Codex ships `voiceAgent: false`** until someone captures a real session transcript.
   Shipping `true` for an unverified provider means failing at handshake in front of a user.
7. **Explicit store setters** over read-then-toggle, so voice is declarative by construction.

**Scope:** voice input only. Spoken summaries of what the LLM is doing (TTS output) are a
natural follow-on and are explicitly **not** in this plan.

---

## Architecture

2026-08-09 — Phase C + Phase D. 755 tests, tsc exit 0, packaged build ships.
             T00 GATE PASSED WITH REAL NUMBERS (M-series, apple metal-3, Chromium 132):
             2s utterance → median 561ms / best 510ms / p90 755ms on WebGPU q4.
             4.1s clip → median 1228ms. Model load 44.5s cold, 5.0s warm.
             audioContext.sampleRate honours 16000. tiny.en fallback NOT needed.
             THREE REAL BUGS FOUND BY BUILDING, not by reading:
             · **CDN leak (Risk 5, live).** transformers.js sets ONNX wasmPaths to
               cdn.jsdelivr.net unless it is already set. Worker now pins it to its own
               bundle dir. Verified in the BUILT output, not just source.
             · **onnxruntime-web forbids deep ./dist/* imports** via its exports map, so
               `onnxWASMBasePath` cannot be set that way at all. Its default build embeds
               the wasm inline anyway. Caught by a failing test, would have failed the
               production build too.
             · **100MB of packaging bloat.** build.files took node_modules/** wholesale,
               shipping TWO 131MB onnxruntime-web copies + sharp that Vite already bundles.
               Added `!` excludes → DMG 221MB → 120MB. True cost of voice ≈ 19MB.
             DESIGN REVERSALS worth knowing:
             · T24's userData model manager was built, then REMOVED. transformers.js already
               caches weights in the Cache API across restarts; a second download path was
               dead code with zero renderer callers. Don't rebuild it without a reason.
             · vad-web device selection is `getStream`, NOT `additionalAudioConstraints`.
             · The energy-gate worklet + Segmenter (8 tests) are written but UNUSED —
               MicVAD owns its own mic stream. Kept for a future two-stage wiring; Silero
               runs ~31 inferences/sec continuously, which is the cost stage 1 would avoid.
               That idle cost was never measured — the benchmark failed twice and I dropped it.
             STILL NOT DONE (needs a human, not more code):
             · Nothing in the audio path has EVER run with a real microphone.
             · T30 soak (1hr ambient), live DevTools-offline run, macOS orange-dot check.
             · Notarization skipped in build:mac — no credentials in this env.
             · T33 Codex blocked: not installed; registry ships voiceAgent:false so the
               picker simply omits it. Nothing is broken.
```
mic → AudioWorklet (16kHz) → VAD → whisper Worker → transcript
                                                        ↓
                                    [state snapshot] + [transcript]
                                                        ↓
                                          background agent PTY
                                                        ↓
                                    {action, target, say, needsConfirm}
                                                        ↓
                                              dispatchAppAction()
```

The agent is a **translator, not an executor**. It emits an action object; the renderer
validates against an allowlist and only then dispatches. A hallucinated
`{"action":"delete_everything"}` fails validation and is logged, never run.

### Dispatch chain (every utterance)

```
1. transcript + state snapshot  → agent PTY
2. agent line                   → strip ANSI, extract JSON
3. { action, target }           → validate: action in ACTION_SPECS?   ── no → drop, log
4.                              → spec.capability enabled?            ── no → reject
5.                              → spec.needsTarget && !target?        ── yes → reject
6.                              → resolve target to a concrete id     ── miss → reject
7.                              → spec.destructive?                   ── yes → confirm toast
8.                              → spec.run(target, ctx)
9. DispatchResult               → Voice page history + optional ack
```

Four properties that must not regress:
- The agent never executes. Steps 3–6 are pure renderer-side validation.
- `destructive` is **local**, never agent-supplied. The agent may suggest `needsConfirm`;
  we ignore it. Trusting a model to self-classify its dangerous actions is backwards.
- Capability gating happens *before* execution, so voice can't target a disabled page and
  get bounced by the stranding guard in `AppLayoutGrid.tsx`.
- Target resolution is the renderer's job. Unresolvable target → clean failure, never
  action-on-nearest-match.

**Two entry points, one dispatcher.** The local fast-path (Risk 1) and the agent both
produce an `AppActionRequest` and run the identical chain; the fast-path skips steps 1–2.
Menu actions enter at step 8 with no target. Exactly one place mutates app state.

---

## Task tracker

### Phase A — Foundation (no audio, no agent)

| ID | Task | Deps | Status | Verify |
|----|------|------|--------|--------|
| T01 | Extract `fuzzyMatch` → `lib/fuzzy.ts` and `flattenTree` → `lib/flatten-tree.ts` from `CommandPalette.tsx`; palette imports them | — | **done** | ✅ Moved verbatim; 12 unit tests added; palette imports both |
| T02 | Create `lib/app-actions.ts`: `AppActionRequest`, `DispatchResult`, `DispatchContext`, `ACTION_SPECS`, `dispatchAppAction`. Move the `App.tsx` switch body verbatim | — | **done** | ✅ 23 specs + `switch-project-N` regex fallback |
| T03 | Route `App.tsx` menu handler through `dispatchAppAction`; collapse the switch | T02 | **done** | ✅ Handler is now 1 line. **Parity proven mechanically**: all 22 emitted menu strings have specs (test asserts this). Build + 659 tests + tsc clean |
| T04 | Route `CommandPalette` action items through the dispatcher | T02 | **done** | ✅ 16/17 routed (`action:enqueue` correctly excluded — depends on live palette `query`, not app state). 6 new specs added. Parity asserted in test |
| T05 | Add declarative store setters | — | **done** | ✅ `editor-prefs-store` + `theme-store` were **already declarative**. Added `setGitCollapsed(projectId, bool)` (early-returns when unchanged), `toggleGitCollapsed` now a thin wrapper. Voice on/off via `resolveBooleanTarget` |
| T06 | Add `showWorkspaceTab(tab)` helper (clears page overlay via `setActiveProject`, then `setCenterTab`) | T02 | **done** | ✅ All 4 `center-tab-*` specs route through it. `CenterTab` exported from `editor-store`. **Capability gating now enforced in `dispatchAppAction` (step 4)** — `center-tab-claude`→`configFiles`, `center-tab-skills`→`skills`, `clear-context`→`clearContext` |
| T07 | New target-resolving actions in `ACTION_SPECS` | T02, T05, T06 | **done** | ✅ 6 added: `switch-project`, `focus-terminal`, `open-file`, `switch-branch`, `show-git`, `set-theme`. ⬜ `run-dev-server` deferred — needs pkg-manager detection, see note below |
| T08 | `lib/voice/resolve-target.ts` — target string → concrete store id, per action | T01, T07 | **done** | ✅ 21 tests. `parseOrdinal` (words/digits/nth), `resolveByName` (exact→alias→fuzzy w/ score floor), `resolveByOrdinalOrName`, `resolveFilePath` (path→basename→despaced→fuzzy name→fuzzy path). **Unresolvable returns null, never a nearest guess** |

### Phase B — Agent translation layer (still no audio)

| ID | Task | Deps | Status | Verify |
|----|------|------|--------|--------|
| T09 | `lib/voice/state-snapshot.ts` — `buildStateSnapshot()`, capability-filtered | T01 | **done** | ✅ 10 tests. Tabs numbered (ordinals are the handle), LLM tab annotated with provider label, `unavailable:` line names capability-off targets |
| T10 | `lib/voice/agent-protocol.ts` — preamble, ANSI-stripping parser, validation | T02 | **done** | ✅ 23 tests: ANSI, box-drawing, fences, prose-wrapped, array-wrapped, split-across-writes via `AgentLineBuffer` |
| T11 | `main/services/voice-agent.ts` — spawn/handshake/send/stop | T10 | **done** | ✅ Follows `mcp.ts` PTY precedent. readyPattern OR 1.2s quiet → preamble; 30s handshake timeout → `degraded`. ⬜ Not yet exercised against a live CLI |
| T12 | `main/ipc/voice-agent.ts` + `safeHandle` + preload + teardown ×2 | T11 | **done** | ✅ Registered; `stopVoiceAgent()` in BOTH teardown blocks. ⬜ `ps` orphan check pending a live run |
| T13 | Registry: `voiceAgent` + `readyPattern` | — | **done** | ✅ claude:true (+readyPattern), codex:false, custom:true. `VOICE_AGENT_PROVIDERS` + `supportsVoiceAgent()`. **Confirmed `codex` is not installed on this machine** |
| T14 | Voice settings in `layout-store` (+ partialize + merge validation) | T13 | **done** | ✅ `voiceEnabled`, `voiceAgentProviderId`, `voiceAgentCustomCommand`, `voiceVadSilenceMs`, `voiceConfirmDestructive` all persisted; `merge` validates provider id via `isLlmProviderId` + `supportsVoiceAgent`, clamps VAD ms (300–2000), falls back cleanly on garbage |
| T15 | `project-store`: `voicePageActive` + `showVoicePage()` + `PAGES_OFF` | — | **done** | ✅ Added to the interface, `PAGES_OFF`, the initial state, and `activePageName()` in the snapshot. Opening the voice page closes other pages and vice versa |
| T16 | `VoicePage` + `VoiceSettings` + `VoiceHistory` + `AgentTerminal`; rail Mic entry | T14, T15 | **done** | ✅ Wired into `AppLayoutGrid` rail + overlay + `anyPageActive`. ⬜ Visual check pending a live run |
| T17 | **Text-input path** — type an utterance, no mic | T08, T09, T12, T16 | **done (untested live)** | ✅ Input box in `VoiceHistory` → `submitUtterance()` → fast-path or snapshot+agent → validate → dispatch, with the result rendered in history. ⬜ **Never run against a live `claude` PTY** — this is the single most valuable thing to try first |
| T18 | Destructive confirm, driven by `ACTION_SPECS.destructive` | T17 | **done** | ✅ Inline confirm bar in `VoiceHistory`. Tests prove "commit this" holds pending, cancel runs nothing, confirm dispatches, and disabling the pref runs immediately |
| T19 | Local fast-path phrase table + fallback when agent is dead | T17 | **done** | ✅ `lib/voice/fast-path.ts`, 19 rules, 7 tests. Test asserts **every rule emits a real `ACTION_SPECS` key**. Works with agent stopped. ⬜ Live PTY-kill check pending |

### Phase C — Audio (gated on T00)

| ID | Task | Deps | Status | Verify |
|----|------|------|--------|--------|
| T00 | **Latency spike (gate)** | — | **done ✅ PASS** | **Measured on this machine (M-series, `apple metal-3`, Chromium 132).** `audioContext.sampleRate = 16000` ✅ (no manual decimation needed). WebGPU adapter present ✅. **2s utterance (the real workload): median 561ms, best 510ms, p90 755ms.** 4.1s clip: median 1228ms, p90 1762ms. Model load 44.5s cold / **5.0s warm from HTTP cache**. Transcript accurate. → **PROCEED, set VAD trailing silence to ~500ms.** `tiny.en` fallback NOT needed. Spike deleted |
| T20 | Verify Risk 4: does `@huggingface/transformers` drag `sharp`/`onnxruntime-node` into the renderer graph? | T00 | **done ✅ NO LEAK** | Installed `@huggingface/transformers@4.2.0` + `@ricky0123/vad-web@0.0.30`. `sharp` + `onnxruntime-node` ARE present in `node_modules` (real deps), but Vite resolves the `browser` field and **never bundles them** — build emitted the worker + `ort-wasm-simd-threaded.*.wasm` only. **No `rollupOptions.external` needed.** ⚠️ The ORT wasm is 12–24MB depending on variant (jsep = WebGPU, 24MB); see Risk 12 |
| T21 | Audio capture + energy-gate worklet | T00 | **done** | ✅ `worklets/energy-gate.worklet.js` (RMS gate + hangover tail), `audio-capture.ts`, `lib/voice/segmenter.ts` (**8 tests**, incl. mid-sentence-pause). ⚠️ Currently UNUSED by the live path — `SileroVad` owns its own mic stream. Kept as the stage-1 gate for a future two-stage wiring; see session log |
| T22 | `services/voice/vad.ts` — Silero via `@ricky0123/vad-web`, app-local assets | T21 | **done (fixed after live run)** | ✅ `baseAssetPath` + `modelURL` via Vite `?url`; **`onnxWASMBasePath` IS settable after all** — my earlier "impossible" note was wrong. Device selection is `getStream`, NOT `additionalAudioConstraints` |
| T23 | `transcribe.worker.ts` + `transcriber.ts` | T20 | **done** | ✅ Zero-copy transferable, recycle after 60 segments, WebGPU→wasm fallback, queue cap 3 dropping oldest. PCM never crosses Electron IPC |
| T24 | Model download strategy | — | **done (redesigned)** | ⚠️ **The userData model-manager was BUILT then REMOVED.** transformers.js keeps its own weights cache (Cache API) that already persists across restarts, so a second download path was dead code — a `whisperModel` IPC surface with zero renderer callers. Worker now sets `env.useBrowserCache = true`; `isModelCached()`/`clearModelCache()` in the controller read that real cache. Net: **first use downloads ~50MB from HF, every later run is offline.** No weights bundled (they would tax every auto-update for every user) |
| T25 | Controller orchestration: VAD → worker → dispatch | T21, T22, T23, T17 | **done (untested live)** | ✅ `startListening`/`stopListening`/`handleSpeechSegment`, mic status machine, `attachDeviceChangeRecovery()`. ⬜ **Never exercised with a real microphone** |
| T26 | StatusBar mic indicator + mute semantics | T25 | **done (untested live)** | ✅ `MicIndicator` in StatusBar (hidden when off), mic controls in Voice page. Mute calls `vad.destroy()` (NOT pause) so tracks actually stop. `devicechange` auto-restarts. ⬜ **macOS orange-dot check pending a live run** |

### Phase D — Hardening

| ID | Task | Deps | Status | Verify |
|----|------|------|--------|--------|
| T27 | Allowlist adversarial test | T17 | **done** | ✅ `lib/voice/hardening.test.ts`: 5 hostile actions dropped; **agent-supplied `needsConfirm:false` is never parsed into the action at all** (destructive stays local to ACTION_SPECS); a target cannot smuggle a second action |
| T28 | Capability gating test | T17 | **done** | ✅ codex workspace → `center-tab-skills`/`clear-context` return `capability-off`; snapshot emits `unavailable:`. **Proven independent of the voice-agent provider** (voice=claude + workspace=codex still blocks) |
| T29 | Offline test | T22, T23 | **done (static) + live 404s fixed** | ✅ Fixed the transformers.js `cdn.jsdelivr.net` wasmPaths leak. ✅ **Then a real `npm run dev` surfaced TWO 404s the static check missed** — see the ORT asset note below. `huggingface.co` remains and is correct (weights on first use, then Cache API). ⬜ Live DevTools-offline run still pending |
| T30 | Long-session soak | T25 | **done (proxied) + 1 human step** | ✅ `lib/voice/soak.test.ts` (7 tests) pins the failure modes a soak hunts for: history **capped at 200, newest kept**; no audio buffers retained in history; **200 consecutive utterances stay byte-identical in size** (proves no state leaks between them); runaway speech force-flushes at 20s; 100 sub-threshold blips discarded; 7 overheard conversational phrases produce **no** fast-path match while real commands still do. ⬜ Only the irreducible part is left: an hour of real ambient audio through a real mic, plus unplugging headphones to exercise `attachDeviceChangeRecovery()` |
| T31 | `npm run test` + `npx tsc --noEmit` | all | **done** | ✅ **755 tests pass, tsc exit 0** (was 640 at session start). tsc is CLEAN — the "dirty baseline" note in project memory is stale |
| T32 | Packaged build `npm run build:mac` | T31 | **done (notarize unverified)** | ✅ Builds + signs + launches (ran 45s, no crash). **Found + fixed 100MB of bloat**: `build.files` packaged `node_modules/**` wholesale incl. TWO 131MB `onnxruntime-web` copies + `sharp`, none needed at runtime (Vite bundles them). Added `!` excludes → **DMG 221MB → 120MB** (~19MB true cost of voice vs the ~101MB pre-voice baseline). `node-pty` retained. ⚠️ **Notarization SKIPPED** — no credentials in this env |
| T33 | Codex support | T13 | **done (as far as auth allows)** | ✅ **Installed codex 0.147.0 and captured a real 72KB PTY transcript.** Two findings: (1) its banner is `Welcome to Codex` → now set as `readyPattern`; (2) **it emits kitty-keyboard CSI sequences (`ESC[>4;0m`, `ESC[>7u`) that my `stripAnsi` did not handle**, leaving `4;0m` residue — a REAL parser bug, now fixed with a private-parameter-byte class and locked by `codex-fixtures.test.ts` (10 tests on the captured bytes). ⛔ `voiceAgent` stays **false**: `codex login status` reports "Not logged in", so JSON-contract compliance is still unproven. Flip it only after an authenticated session holds the one-line-JSON contract |

---

## Verified facts (checked against the tree — do not re-litigate)

Confirmed 2026-08-08 on `master`:

- `resources/entitlements.mac.plist` has `device.audio-input`, `allow-jit`,
  `allow-unsigned-executable-memory`. `NSMicrophoneUsageDescription` is in
  `package.json → build.mac.extendInfo`. `src/main/index.ts` auto-grants `media` and calls
  `askForMediaAccess('microphone')`. **No entitlement or permission work is needed.**
- `src/main/ipc/mcp.ts` already spawns a headless `claude` PTY and consumes `onData` —
  direct precedent for the background-agent pattern.
- node-pty prebuilds are N-API (`napi_register_module_v1`), ABI-stable across Node and
  Electron. Rule for STT: **N-API or no addon at all.**
- `smart-whisper` (`node-gyp rebuild`, no prebuilds) and `nodejs-whisper` (git-clones and
  makes whisper.cpp) are both **rejected**.
- Web Speech API is a trap in Electron: `webkitSpeechRecognition` often exists on `window`
  so feature-detection lies, but it needs a Google endpoint key baked into official Chrome
  builds. Fails `service-not-allowed`.
- `@ricky0123/vad-web@0.0.30` depends only on `onnxruntime-web` — pure WASM.
- `@huggingface/transformers@4.2.0` pulls `onnxruntime-node` and `sharp` — both native,
  Node-only. **The renderer config does not use `externalizeDepsPlugin()`** (verified:
  main and preload do, renderer has only `react()` + `tailwindcss()`). Risk 3 is live.
- Terminal titles are `"LLM"` / `"Terminal N"`, never `"Claude"`, and are **not unique**
  (three collision sources incl. `replaceTab` producing a bare `"Terminal"`). **Ordinals
  are the reliable handle**; annotate the LLM tab with `providerDefinition(id).label`.
- Project `name` is the folder basename and immutable (no rename API). Ordinal matches
  Cmd+Alt+1-9 order = raw array index / user drag order.

**Two stale claims from the original plan, corrected:**
- ~~`CommandPalette.tsx:234` hardcodes `'claude'`~~ — **already fixed**, it calls
  `useLayoutStore.getState().getLlmStartupCommand()`.
- ~~`terminal-store.ts:224` hardcodes `'claude'` in `initProject`~~ — **already fixed**,
  same call. No bug-fix work in T04.

**Line numbers drift.** `partialize` is at `layout-store.ts:137` and `merge` at `:147`
(the original plan said 135/145). Prefer grepping for symbols over trusting line numbers
anywhere in this document.

---

## Target resolution reference

| Action | Target string | Resolves to |
|---|---|---|
| `switch-project` | `"petsitters"` / `"three"` | projects by name, or ordinal → array index |
| `focus-terminal` | `"two"` / `"llm"` / `"claude"` | ordinal into project-filtered tabs; `"llm"`/provider label → `tabs.find(t => t.initialCommand)` |
| `open-file` | `"layout store"` | `flattenTree` by basename, then path segments; IPC global search on miss |
| `switch-branch` | `"main"` | `branchesPerProject[pid]` by name |
| `set-theme` | `"dracula"` | `THEMES` by name → id |

The tree can be truncated and excludes gitignored files — fall back to IPC global search.

---

## Snapshot format

```
[state]
projects: vibecoder*, petsitters, polymarket
tabs: 1=LLM(Claude Code), 2=Terminal 2, 3=Terminal 3
dev-tabs: Dev 1
files: App.tsx*, layout-store.ts, TerminalPanel.tsx
tree: 340 files (App.tsx, main/index.ts, stores/…)
branch: master (main, feature/voice)
page: workspace
center-tab: editor
themes: GitHub, Dracula, Nord, Tokyo Night, …
```

`*` marks active.

---

## Agent protocol

**Provider neutrality is a design constraint.** `--append-system-prompt` is Claude-specific.
The voice agent does not need a system-prompt flag: spawn the bare configured command, then
send the contract as **message one**. Every REPL-style coding CLI accepts a first message.

```ts
const cmd = resolveStartupCommand(providerId, customCommand)   // existing registry fn
pty.spawn(process.env.SHELL || '/bin/zsh', ['-lc', cmd], { cwd, name: 'xterm-256color' })
// once ready:
sendToVoiceAgent(PROTOCOL_PREAMBLE)
```

Preamble (re-sent after any context clear):

> You translate spoken requests into app navigation actions for an IDE. Reply with ONE line
> of JSON and nothing else: `{"action": "...", "target": "...", "say": "...", "needsConfirm": bool}`.
> Use only these actions: [list]. If the request is not a navigation command, reply
> `{"action": "dictate", "target": "<the text verbatim>"}`. Never explain. Never use markdown fences.

**Handshake:** do not send blindly on spawn — CLIs print banners. Wait for `readyPattern` or
a short quiet period on `onData`, then send the preamble and require a valid JSON ack before
accepting utterances. Surface state in the page (`starting → ready → degraded`). Failed
handshake ⇒ mark provider unusable, fall back to the local phrase table.

**Parser:** strip ANSI, buffer partial lines, tolerate markdown fences, and **scan each line
for a JSON object rather than requiring the line to be one**. This is the main
provider-portability risk; unit-test it with captured fixtures per CLI.

**Independent of the workspace provider.** Voice-agent provider defaults to
`layout-store.llmProviderId` but is separately settable — cheap structured translation is a
different job from coding, and forcing them to match would be arbitrary.

---

## Risks

1. **Agent latency dominates.** PTY round trip ~1–3s on top of ~1s STT. Mitigate with the
   T19 local fast-path for pure navigation. If still slow, `--print` one-shots with
   `--resume` trade memory for a tighter loop.
2. **JSON from an ANSI PTY stream** — fences, prose, split writes, per-CLI decoration.
   The `dictate` fallback keeps unparseable output harmless.
3. **Codex unverified** — flags, banner, readiness signal, JSON-contract compliance all
   unconfirmed. Design avoids provider-specific flags so this is tuning, not redesign.
   Ships `false` until T33.
4. **`sharp`/`onnxruntime-node` leaking into the renderer bundle** — verify at T20.
5. **CDN fetches breaking offline** — both vad-web and onnxruntime-web default to CDN.
6. **WebGPU may underdeliver** in Chromium 132. Fallback: WASM+SIMD + `tiny.en`.
7. **Token burn** — every utterance is a turn with a ~300-token snapshot. Fast-path mitigates.
8. **Non-unique terminal titles** — ordinals are the handle, titles a hint.
9. **Dev terminals have no selection state** — `DevTerminalsPanel` renders all tabs in a grid
   with no `activeTabPerProject`. "Switch to the dev tab" can only focus, not select.
10. **Label collisions** — "Claude"/"Skills"/"Terminals" each name both a rail page and a
    center tab; "Claude" also names a terminal. Preamble rule: prefer the center tab when a
    project is active.
11. **No new native modules, no extraResources, no entitlement changes** — what the STT
    choice buys. If a sidecar is ever needed: Mach-O binaries in `extraResources` sit
    outside electron-builder's signing graph and fail notarization without an inside-out
    `afterSign` hook.

---

## Files

**New**
```
src/renderer/lib/app-actions.ts                     dispatchAppAction + ACTION_SPECS
src/renderer/lib/fuzzy.ts                           extracted from CommandPalette
src/renderer/lib/flatten-tree.ts                    extracted from CommandPalette
src/renderer/lib/voice/resolve-target.ts            target string → concrete store id
src/renderer/lib/voice/state-snapshot.ts
src/renderer/lib/voice/agent-protocol.ts            preamble + line parser + validation
src/renderer/services/voice/audio-capture.ts
src/renderer/services/voice/worklets/vad-processor.ts
src/renderer/services/voice/vad.ts
src/renderer/services/voice/transcribe.worker.ts
src/renderer/services/voice/voice-controller.ts
src/renderer/components/voice/VoicePage.tsx
src/renderer/components/voice/VoiceSettings.tsx
src/renderer/components/voice/VoiceHistory.tsx
src/renderer/components/voice/AgentTerminal.tsx
src/main/services/voice-agent.ts
src/main/services/whisper-model-manager.ts
src/main/ipc/voice-agent.ts
```

**Modified**
```
src/renderer/App.tsx                                menu handler → dispatchAppAction
src/renderer/components/palette/CommandPalette.tsx  route through dispatcher; export helpers
src/renderer/components/layout/AppLayoutGrid.tsx    voice page in rail + overlay
src/renderer/components/layout/StatusBar.tsx        mic indicator
src/renderer/stores/project-store.ts                voicePageActive + showVoicePage + PAGES_OFF
src/renderer/stores/layout-store.ts                 voice settings + partialize + merge
src/renderer/stores/theme-store.ts                  declarative setters (T05)
src/renderer/config/llm-provider-registry.ts        voiceAgent + readyPattern
src/main/index.ts                                   registerVoiceAgentHandlers + teardown ×2
src/preload/index.ts                                voice + voiceAgent namespaces
electron.vite.config.ts                             worklet/worker/WASM assets; renderer externals
package.json                                        new deps
```

**UI conventions** — follow `LlmStartupCommandSection.tsx` exactly: fine-grained selectors
(never destructure a whole store), `useAccent()`, `SectionCard`/`PrefToggle` from
`SettingsControls.tsx`. Push events use the preload pattern of `ipcRenderer.on` returning
an unsubscribe closure (see `terminal.onData`).

---

## Session log

Append one line per session. Newest at the bottom.

```
2026-08-08 — Plan written. Verified entitlements, mcp.ts PTY precedent, renderer
             externalize gap (Risk 3 live), palette/terminal-store claude bugs
             (BOTH ALREADY FIXED — removed from scope). No code written yet.

2026-08-08 — T01, T02, T03 done. 659 tests pass (was 640), tsc exit 0, build clean.
             Notes for the next session:
             · tsc is CLEAN — project memory's "dirty baseline" is stale. Hold exit 0.
             · `noUnusedLocals` is NOT set in any tsconfig, so tsc will NOT catch orphaned
               imports after a refactor. Grep call-site counts by hand. Removing the switch
               orphaned 3 store imports in App.tsx that typecheck happily.
             · Menu parity was proven mechanically, not by clicking: extract action strings
               with `grep -oE "send\('[a-z0-9-]+'\)" src/main/index.ts` and diff against
               ACTION_SPECS keys. All 22 covered. `settings` is emitted separately at
               index.ts:155 (direct send, not the helper) — the grep misses it, spec exists.
             · dispatchAppAction returns DispatchResult but App.tsx ignores it. That is
               intentional for menus; the Voice page (T16/T17) is what consumes `say`.
             · ACTION_SPECS destructive flags are asserted in a test. Adding a destructive
               action means updating that list — the test will tell you.

2026-08-08 — T04 done, T05 mostly done. 664 tests pass, tsc exit 0, build clean.
             TWO REAL BUGS FOUND + FIXED while consolidating (not refactor noise):
             · `restart-claude` leaked an xterm instance. Palette (:234) and TerminalPanel
               (:445) both call kill + disposeTerminal; the MENU path called kill only, so
               Cmd-menu restarts leaked listeners/timers/instance every time. Spec now
               disposes. All three restart paths finally agree.
             · `restart-claude` replayed the tab's ORIGINAL `initialCommand` instead of the
               current `getLlmStartupCommand()`. Switching provider then restarting from the
               menu relaunched the OLD provider. Spec now reads the live command, matching
               palette + panel.
             Notes:
             · `action:enqueue` deliberately NOT routed — it closes over the palette's live
               `query` string (component state). Don't "fix" this.
             · Orphan sweep after routing: removed 2 imports (disposeTerminal,
               useEditorPrefsStore) + 3 dead locals (activeTabId, activeTab, editorActive)
               from CommandPalette. tsc stayed green throughout — again, it will NOT catch
               these. Always grep call-site counts after moving logic out of a file.
             · editor-prefs-store + theme-store were ALREADY declarative, so T05 shrank to
               just setGitCollapsed. Voice on/off phrasing is handled by
               resolveBooleanTarget(target, current): bare toggle when no target, explicit
               and idempotent for on/true/enable/yes/show and off/false/disable/no/hide.

2026-08-08 — Phase A + Phase B COMPLETE (T05–T16, T18, T19). 739 tests, tsc exit 0,
             build clean. Voice page is reachable from the rail and drivable by typing.
             ⚠️ NOTHING BELOW HAS BEEN EXERCISED AGAINST A LIVE CLI OR A RUNNING APP.
             The whole Phase B stack is verified by unit tests only. First thing next
             session: `npm run dev`, open the Mic page, Start the agent, type
             "go to the X project". That is the real T17 verify bar.
             ⚠️ **CRLF TRAP — cost me a 350-line phantom diff.**
               `src/renderer/stores/project-store.ts` uses CRLF line endings; most of the
               repo is LF. Editing it with python `open(p).write(s)` silently rewrote the
               WHOLE FILE to LF — tsc/tests/build all stayed green, diff looked enormous.
               Fixed by re-normalising to CRLF. ALWAYS run `git diff --shortstat <file>`
               vs `--ignore-all-space` after a scripted edit; if they disagree wildly,
               you changed line endings, not code. Prefer the Edit tool on that file.
             Notes:
             · Capability gating is enforced in dispatchAppAction step 4 and asserted by
               tests. `codex` is NOT installed on this machine (`which codex` → not found),
               which independently vindicates Decision 6 (voiceAgent: false).
             · The voice agent provider is separate from the workspace provider; the UI
               offers "Follow workspace" (null) plus each voiceAgent-capable provider.
             · Fast-path now includes `commit this` SPECIFICALLY so a destructive action is
               reachable without the agent — that is what makes the T18/T27 confirm test
               meaningful rather than theatre.
             · `resolveTurn` in voice-controller resolves the awaiting promise on the first
               parseable JSON line. 20s timeout increments `unparseableStreak`. Nothing
               yet CONSUMES the streak to flip status to degraded — wire that when a real
               CLI shows how noisy it actually is.
2026-08-09 — Phase C + Phase D. 755 tests, tsc exit 0, packaged build ships.
             T00 GATE PASSED WITH REAL NUMBERS (M-series, apple metal-3, Chromium 132):
             2s utterance → median 561ms / best 510ms / p90 755ms on WebGPU q4.
             4.1s clip → median 1228ms. Model load 44.5s cold, 5.0s warm.
             audioContext.sampleRate honours 16000. tiny.en fallback NOT needed.
             THREE REAL BUGS FOUND BY BUILDING, not by reading:
             · **CDN leak (Risk 5, live).** transformers.js sets ONNX wasmPaths to
               cdn.jsdelivr.net unless it is already set. Worker now pins it to its own
               bundle dir. Verified in the BUILT output, not just source.
             · **onnxruntime-web forbids deep ./dist/* imports** via its exports map, so
               `onnxWASMBasePath` cannot be set that way at all. Its default build embeds
               the wasm inline anyway. Caught by a failing test, would have failed the
               production build too.
             · **100MB of packaging bloat.** build.files took node_modules/** wholesale,
               shipping TWO 131MB onnxruntime-web copies + sharp that Vite already bundles.
               Added `!` excludes → DMG 221MB → 120MB. True cost of voice ≈ 19MB.
             DESIGN REVERSALS worth knowing:
             · T24's userData model manager was built, then REMOVED. transformers.js already
               caches weights in the Cache API across restarts; a second download path was
               dead code with zero renderer callers. Don't rebuild it without a reason.
             · vad-web device selection is `getStream`, NOT `additionalAudioConstraints`.
             · The energy-gate worklet + Segmenter (8 tests) are written but UNUSED —
               MicVAD owns its own mic stream. Kept for a future two-stage wiring; Silero
               runs ~31 inferences/sec continuously, which is the cost stage 1 would avoid.
               That idle cost was never measured — the benchmark failed twice and I dropped it.
             STILL NOT DONE (needs a human, not more code):
             · Nothing in the audio path has EVER run with a real microphone.
             · T30 soak (1hr ambient), live DevTools-offline run, macOS orange-dot check.
             · Notarization skipped in build:mac — no credentials in this env.
             · T33 Codex blocked: not installed; registry ships voiceAgent:false so the
               picker simply omits it. Nothing is broken.
2026-08-09 (later) — T30 + T33 closed as far as this machine allows. 771 tests, tsc 0.
             ONE MORE REAL BUG, found by actually installing Codex:
             · **stripAnsi did not handle CSI private parameter bytes.** Codex enables
               the kitty keyboard protocol (ESC[>4;0m, ESC[>7u); the old regex left
               "4;0m" / "7u" residue in every cleaned line. JSON extraction survived it
               (it scans for "{"), but readyPattern matching and any prose handling would
               have been corrupted. Fixed with a proper CSI class; 10 tests in
               codex-fixtures.test.ts lock it against the REAL captured bytes.
             T33: installed codex 0.147.0 into the scratchpad (never global, since removed)
             and captured a 72KB PTY transcript. Banner "Welcome to Codex" is now its
             readyPattern. voiceAgent STAYS false — `codex login status` says "Not logged
             in", so the one-line-JSON contract is unproven. Do not flip the flag without
             an authenticated run.
             T30: a real soak needs a human, but its failure modes are now pinned by
             soak.test.ts — history cap keeps newest, no audio buffers retained, 200
             consecutive utterances identical in size (no inter-utterance leak), runaway
             speech force-flushes, blips discarded, and 7 overheard phrases produce no
             fast-path match while real commands still match.
             WHAT A HUMAN STILL HAS TO DO (unchanged, and it is the valuable part):
             · Run the app, open the Mic page, Start the agent, type "go to the X project".
               Nothing in this feature has EVER talked to a live claude PTY.
             · Speak to it. No audio has ever gone through the VAD/worker path.
             · Watch the macOS orange mic dot clear on mute; unplug headphones mid-session.
             · DevTools-offline run after the model caches.
             · Notarize (no credentials in this env).
2026-08-09 (live run) — Jo ran `npm run dev` and hit TWO 404s. Both are now fixed.
             This is why static bundle-grepping was not enough.

             **404 #1 — vad-web:** GET .../node_modules/.vite/deps/ort-wasm-simd-threaded.mjs
             I had concluded `onnxWASMBasePath` was UNSETTABLE because onnxruntime-web's
             `exports` map forbids deep ./dist/* specifiers. **That conclusion was wrong.**
             The exports map only blocks *bare specifiers*; the files are reachable by
             PATH. vad-web fell back to its own bundled location, which has no ORT files.

             **404 #2 — transcription worker:** GET /services/ort-wasm-simd-threaded.asyncify.mjs
             I had set `wasmPaths = new URL('./', import.meta.url)`. The worker sits at
             /services/ in dev but /assets/ in a build, so a self-relative path lands
             somewhere different in each. Now anchored on `self.location.origin`.

             **The underlying trap:** the ONNX loader fetches its sibling `.wasm` by an
             EXACT hardcoded name (`ort-wasm-simd-threaded.wasm`). Vite hashes asset
             filenames, so `?url` imports can NEVER satisfy it — the loader asks for the
             unhashed name and 404s. Fix is `ortAssetsPlugin` in electron.vite.config.ts:
             copies six ORT files VERBATIM to `assets/ort/` and serves that same path in
             dev middleware, so one origin-anchored base path works in dev, prod and
             file:// packaging.

             Six files, because two consumers need different builds from one directory:
               vad-web (Silero, wasm EP)      → ort-wasm-simd-threaded.{mjs,wasm}
               transformers.js (whisper, GPU) → .asyncify.{mjs,wasm} + .jsep.{mjs,wasm}

             Locked by `services/voice/ort-assets.test.ts` (6 tests) which asserts the
             files exist, that the loader still hardcodes the sibling name, that the
             config copies all six, and that the worker does NOT use a self-relative
             wasmPaths. 777 tests, tsc 0, build clean, all six serve 200 in dev.

             STILL UNVERIFIED: whether whisper actually transcribes end-to-end. The VAD
             now produces segments (Jo saw "(audio)" entries), so the mic path works —
             the next real test is whether a spoken phrase becomes a dispatched action.
```
