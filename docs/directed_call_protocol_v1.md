# Directed-call protocol V1

This document defines the dormant shared wire language. It is not connected to
the current Phoenix call channel or client call runtime.

The protocol version is 1, capability is directed_calls_v1, and the future
topic is directed_call:<user_ref>. The client owns a stable UUID device_id
persisted across application restarts; it is not a secret or hardware identity.
Each logical command owns a UUID command_id and exact retries reuse it.
Every signaling message has a fresh signal_id; sync uses a separate request_id.

The client now contains a dormant persistent session foundation. Its feature
gate is disabled by default, so legacy calling remains the sole active call
authority. The foundation joins the directed-call topic, stores durable state,
recovers projections through sync after reconnect, and observes transient
signals without passing them to WebRTC. It does not yet integrate with UI,
lifecycle commands, media, or WebRTC. Reconnect does not recover transient
signals.

The dormant lifecycle controller now provides explicit APIs for the lifecycle
events call:initiate, call:received, call:presented, call:accept, call:cancel,
call:decline, call:hangup, and call:begin_connecting. It owns in-memory command
IDs and bounded explicit retries, while canonical controller state comes only
from accepted projections. It does not send received or presented
automatically, does not switch lifecycle or UI authority, and does not protect
against multiple-window controller ownership yet. Persistent calling is not
production-ready; legacy calling remains the sole active runtime and all
feature gates remain disabled by default.

The dormant incoming presentation coordinator now handles recipient projections
through the dispatching-to-delivered-to-presented sequence. It sends
`call:received` once for an eligible dispatching projection, exposes only
authoritative delivered or presented projections for a future incoming modal,
and sends `call:presented` only from an explicit post-commit callback for that
exact call. Accepted, connecting, active, and terminal projections dismiss the
presentation; accept and decline remain unwired. Multi-device advancement is
followed through authoritative projections, and disconnect does not infer a
terminal result. The coordinator is not instantiated by the Stage A session and
remains behind the disabled persistent-runtime boundary.

If a `call:received` or `call:presented` transport command fails, its original
command identity remains pending in the lifecycle controller. After a successful
reconnect and completed sync, only an action still required by the authoritative
projection is retried, using that same command identity and the controller's
bounded attempt limit. Authoritative advancement suppresses obsolete retries and
stale local transport errors; no terminal state is inferred locally.

The dormant B3 presentation model now maps authoritative projections into a
persistent-specific presentation phase and exposes explicit outgoing,
accept, decline, cancel, and hangup actions without mounting them in the
active UI. Ringing still begins only at authoritative `presented`; accept and
decline may remain local intents until that boundary. Uncertain initiation
cancellation resolves the original initiate command with bounded retries before
issuing a distinct cancel when a cancellable call ID is known. `begin_connecting`
and all media work remain deferred, and cross-window ownership remains a B4
boundary. The persistent runtime is still disabled by default.

Explicit B3 lifecycle actions retain their logical command identity after
transport uncertainty. The presentation model retries the retained command only
while the authoritative projection still requires that action, using the
bounded controller attempt limit; acknowledgements do not end local pending
presentation before projection advancement. Rejected replies are not treated as
successful transitions, and authoritative advancement clears obsolete actions
and scoped errors. Uncertain initiate cancellation re-reads the newest
projection before sending a distinct cancel. B4 ownership and all media work
remain deferred.

Lifecycle selection is sticky for a selected live call. When the selected call
is terminal, a live call may replace it; terminal projections remain in the
session store. Sync selection is deterministic by `created_at`, then
`call_id`, and does not depend on subscription timing or map iteration. A
rollover clears action, error, initiation, and fallback presentation data scoped
to the old call. After the third transport attempt, the retained action is
`retry_exhausted`, cannot issue a fourth attempt, and remains scoped to its
original call and action until authoritative advancement makes it obsolete.

B4 introduces one exclusive client runtime mode, resolved from
`VITE_CALL_RUNTIME_MODE`: missing, empty, or `legacy` means legacy; `persistent`
is opt-in; and any other explicit value fails closed as `disabled`. The retired
`VITE_ENABLE_DIRECTED_CALL_SESSION` boolean is not read and cannot enable a
persistent runtime. The legacy mode remains the compatibility default.

Call authority is scoped by authenticated profile and the stable directed-call
`device_id`: `vetra:call-authority:<profile-scope>:<device-id>`. Persistent mode
requires a valid public-user UUID. Legacy mode uses that UUID when available or
a clearly prefixed numeric-user scope otherwise. In browsers and same-process
webviews, Web Locks are acquired exclusively with `ifAvailable`; an acquired
lock is held until the owned runtime has disposed. In Tauri, persistent
authority requires both that frontend Web Lock and a native OS-backed exclusive
lock held by the Rust process. The native lock identifier is hashed, its handle
remains alive for the ownership lifetime, and the operating system releases it
after process termination. Missing or failing native authority fails closed;
Tauri never falls back to Web Locks alone. BroadcastChannel, when available,
is advisory only: it can announce release and prompt a bounded retry, but it can
never grant ownership. A non-owner retries only after attempting the real lock;
there is no timestamp lease, timeout stealing, or automatic persistent-to-legacy
fallback.

The owner-only boundary mounts exactly one legacy `CallProvider` in legacy mode,
or constructs the dormant pre-media persistent session, lifecycle controller,
incoming coordinator, presentation model, transient signal transport, and
media-coordinator skeleton in persistent mode. A non-owner,
disabled mode, invalid persistent identity, or unavailable Web Locks renders
ordinary messaging without either call authority, call channels, call controls,
or incoming-call presentation. Runtime disposal precedes lock release; logout,
profile replacement, and unmount perform that cleanup without sending a
canonical terminal command. Socket disconnect does not transfer ownership or
infer call termination. Persistent mode remains headless and pre-media: it
does not create a microphone, WebRTC object, SDP, ICE, or media track. The C1
signal transport is scoped to one call and runtime generation, rejects foreign
or stale call IDs, and has no lifecycle or media authority.

Initial persistent signaling supports only `offer`, `answer`, and
`ice_candidate`. Signals are transient, non-canonical, are not persisted or
replayed after reconnect, and are decoded before subscribers receive them.
The current server relays a valid signal to every connected device on the peer
participant topic; sender/recipient device routing is not present and remains
deferred. Signal payloads and SDP/ICE contents are never logged or exposed in
transport errors. C1 provides only the transport boundary and a media-free
coordinator skeleton. C2 now adds isolated audio-only WebRTC and
authoritative media lifecycle integration. The original initiator prepares and
sends the offer, while the recipient prepares and sends the answer. The offer
is relayed only after authoritative `connecting`; both participants report
`call:media_ready`, and only the server may produce canonical `active`.

C2 maps confirmed local setup failures to the existing privacy-safe failure
codes and sends `call:setup_failed` only while the same owned call remains in
an allowed canonical state. Terminal projections, ownership loss, logout,
runtime disposal, and socket disconnect do not create setup failures. Local
audio tracks, remote audio, peer connections, queued ICE, subscriptions, and
pending work are cleaned up deterministically. Transient SDP/ICE is not
recovered after reconnect; C3 owns hardened recovery, diagnostics, and UI
activation.

The implementation is covered by browser-style injected ownership tests and
Rust native-lock tests. Browser Web Locks coordinate same-process webviews;
the native lock coordinates separate Tauri processes. Manual Windows/Tauri
verification of two real processes, takeover after owner exit, and crash
release remains required before relying on the production boundary.

call:received means transport accepted and parsed an incoming call.
call:presented means the visible in-application incoming-call surface has
committed. An operating-system notification alone is not presented.

Canonical state projections use state_version and are viewer-specific. Unseen
and higher versions are accepted, lower versions are stale, equal identical
versions are duplicates, and equal conflicting versions require a later sync.
Signaling has independent identifiers and is never filtered by canonical state
version. The current call UI, signaling service, WebRTC service, provider,
fullscreen behavior, and screen sharing are unchanged.

The server strictly validates V1 inbound payloads; the C1 client signal
decoder also requires the exact V1 signal envelope and payload keys for the
three supported initial kinds. Phoenix
integration, sync execution, retry scheduling, and runtime device-ID storage
belong to later stages.

C3 connects the persistent owner runtime to a persistent-specific presentation
context and thin call surface. It is the only owner of the persistent incoming
modal, action source, active surface, and remote-audio renderer; non-owner
windows expose ordinary messaging without call controls. Legacy mode continues
to use its existing provider and UI authority unchanged.

After reconnect, the session rejoins and syncs normally. Durable projections
are trusted, terminal projections dispose media immediately, and transient SDP
or ICE is never replayed. An incomplete setup whose transient signaling may
have been lost is disposed locally and reported as a recoverable call issue;
no canonical state is invented and no setup failure is sent solely for
disconnect or ownership loss. An active peer connection is retained only while
its authoritative projection remains active and the local adapter remains
healthy. A new owner after a crash does not recreate an offer for an active or
ambiguous call.

C3 diagnostics use the existing opt-in call diagnostics setting and record only
redacted call IDs, runtime/ownership state, canonical state, local media phase,
socket and peer-connection state, typed failure kinds, and cleanup reasons.
SDP, ICE candidates, IP addresses, media contents, tokens, and private user
data are never logged. Persistent mode remains explicit through
`VITE_CALL_RUNTIME_MODE=persistent`; missing configuration remains legacy and
unavailable browser media APIs fail closed without fallback. Peer signals are
still transient and currently fan out to all peer devices. Owner crash cannot
resume the previous WebRTC session, no TURN-specific rollout is included, and
Windows/Tauri runtime verification remains unclaimed. C3 leaves hardened
transient recovery and broader rollout safeguards for later work.

The shared fixture bundle contains 14 valid and 12 invalid fixtures, including
numeric target and peer IDs, unknown keys, invalid failure codes, negative
versions, forbidden state or signal fields, missing signal IDs, oversized SDP,
duplicate sync calls, and unknown signal kinds. The oversized-SDP fixture is
compact metadata: tests expand its SDP to exactly 262145 bytes, one byte above
the shared 262144-byte limit. Fixture filenames, bytes, hashes, enums,
timestamps, and nullability match the server bundle. Strict server validation
rejects unknown keys; client inbound decoders may ignore unknown future fields
and retain only known fields, including stripping the extra state `device_id`
and signal `state_version` fields.
