# Directed-call protocol V1

This document defines the dormant shared wire language. It is not connected to
the current Phoenix call channel or client call runtime.

The protocol version is 1, capability is directed_calls_v1, and the future
topic is directed_call:<user_ref>. The client owns a stable UUID device_id
persisted across application restarts; it is not a secret or hardware identity.
Each logical command owns a UUID command_id and exact retries reuse it.
Every signaling message has a fresh signal_id; sync uses a separate request_id.

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
