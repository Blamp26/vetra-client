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

call:received means transport accepted and parsed an incoming call.
call:presented means the visible in-application incoming-call surface has
committed. An operating-system notification alone is not presented.

Canonical state projections use state_version and are viewer-specific. Unseen
and higher versions are accepted, lower versions are stale, equal identical
versions are duplicates, and equal conflicting versions require a later sync.
Signaling has independent identifiers and is never filtered by canonical state
version. The current call UI, signaling service, WebRTC service, provider,
fullscreen behavior, and screen sharing are unchanged.

The server strictly validates V1 inbound payloads; client decoders may ignore
unknown future fields but only retain known validated fields. Phoenix
integration, sync execution, retry scheduling, and runtime device-ID storage
belong to later stages.

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
