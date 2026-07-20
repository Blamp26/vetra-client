# Vetra client agent guidance

This repository is the Vetra client. Work primarily in
`/mnt/games/vetra/repos/vetra-client`. The Vetra server is
`/mnt/games/vetra/repos/vetra-server`; inspect it read-only unless a task
explicitly authorizes a server change. Do not modify both repositories in one
implementation stage unless explicitly requested. The server owns persistent
directed-call lifecycle, authorization, and database authority.

## Discovery and scope

- Inspect current code and tests before editing. Use Codebase Memory first for
  code discovery (`get_architecture`, `search_graph`, `trace_path`,
  `get_code_snippet`, `query_graph`, and related search tools); use ordinary
  search for literals, documentation, configuration, and exact file paths when
  graph results are insufficient.
- Work on one bounded stage at a time. Preserve unrelated working-tree state,
  including `.impeccable/critique/`.
- Do not install or upgrade dependencies unless the task explicitly requires
  it. Do not change generated files, lockfiles, or application behavior as a
  side effect of documentation or audit work.
- Do not claim Windows, Tauri, browser, or manual visual verification unless
  it was actually performed. Distinguish direct test evidence, regression
  evidence, source inspection, inference, and manual verification in reports.

## Git and operations

Use the normal fast-forward workflow on `main`: inspect status, make the
bounded change, validate, commit intentionally, and push with
`git push origin main` when requested. Never amend, reset, rebase, force-push,
or force-with-lease published history. Do not deploy, start production
systems, or make external changes unless explicitly requested.

## Directed-call authority

The client wire contract is defined by
[`docs/directed_call_protocol_v1.md`](docs/directed_call_protocol_v1.md) and
the Stage 2C1 fixtures in `test/fixtures/directed_call_v1/`. They must remain
byte- and semantically compatible with the server fixtures. The canonical
persistent lifecycle and persistence authority is maintained in the server
repository, especially its
[`docs/directed_call_protocol_v1.md`](../vetra-server/docs/directed_call_protocol_v1.md).
Do not copy that specification here or create a competing authority. Future
room/channel calls remain separate from both directed-call systems.

Persistent directed calls and legacy direct calls must never be simultaneous
authorities for one call. In particular:

- `preparing` is local client state, not a server state.
- Do not acquire a microphone, create a PeerConnection, or create SDP before
  the accepted/connecting boundary.
- The original initiator remains the offerer. The recipient acquires a
  microphone only after accepting.
- `received` means the incoming call was accepted and parsed; `presented`
  means the visible in-application incoming-call surface committed. Ringing
  begins only from authoritative `presented`.
- The active UI and timer begin only from authoritative server `active`.
- Transient signals are independent of canonical state versions. Handle every
  ICE candidate independently; do not discard signals because of an equal or
  stale state version.
- Disconnect does not canonically end a persistent call. `call:sync` recovers
  durable state, not transient signaling.
- Screen sharing, active renegotiation, ICE restart, and camera/video remain
  deferred from the initial persistent audio rollout.

Preserve the manually verified call layout, fullscreen behavior, media
geometry, context menus, and presentation components unless a confirmed
visual defect is explicitly in scope.

## Implementation discipline

- Reuse existing presentation components where possible. Replace lifecycle
  and media authority behind explicit boundaries.
- Prefer dedicated persistent session, controller, and transport abstractions.
  Do not mutate the legacy signaling service into a mixed dual-authority
  implementation.
- Reuse the existing WebRTC media behavior and ICE queue only through a V1
  transport boundary; do not let it push legacy call events in persistent
  mode.
- Preserve participant, device, command, signal, state-version, recovery,
  privacy, and idempotency guarantees established by the server contract.
- Do not invent unspecified protocol behavior. Stop and report the exact
  blocker when a task requires an unapproved server change, protocol
  invention, second authority, migration, or architectural expansion.

## Validation

Use the existing commands below; select focused files rather than running
unrelated suites for a narrow change.

JavaScript/TypeScript:

```bash
npm test -- --run <focused-file-or-files>
npm exec -- tsc --noEmit
npm run build
npm exec -- vitest run
npm run check:release
npm run check:release:tauri
```

`npm run test:call-stress` is the established focused WebRTC stress command.
The release wrappers also run the TypeScript check, Vitest, and build; the
full release checks may invoke LAN smoke checks and require their documented
environment. Do not use browser or Node tests as evidence of Windows runtime
behavior.

When Rust/Tauri files change, run the repository’s Cargo checks from the
client root:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Tauri/manual Windows verification is separate and must be performed by the
user or an explicitly authorized runtime validation. Source inspection cannot
claim visual verification. Always run:

```bash
git diff --check
```

For each report, state which commands actually ran, exact results, established
unrelated failures, and limitations. Documentation-only changes normally need
`git diff --check`, documentation review, and status verification rather than
the full test suite.

## Task-writing guidance

GPT-5.6 tasks should describe only the current delta and reference this file,
the client protocol document, and the server canonical architecture instead of
copying stable history. State each restriction once and prefer observable
acceptance criteria over procedural micromanagement. Keep detail for lifecycle
transitions, authorization, concurrency, recovery, media timing, privacy, and
destructive actions. Request concise, evidence-based reports with deviations
and limitations explicit. Ordinary bounded tasks should normally fit in about
5–10 thousand characters.
