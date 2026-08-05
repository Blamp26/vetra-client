# Vetra Client Roadmap

This roadmap describes product direction, not release promises. It intentionally avoids invented dates and marks security properties only after they are implemented and verifiable.

## Status language

- **Current:** present in the development source and covered by relevant automated tests.
- **Active:** being integrated, hardened, or validated; not yet a stable public capability.
- **Later:** intended direction with no release commitment.
- **Not claimed:** absent, unverified, or explicitly outside the current scope.

## Current development baseline

The current client source includes:

- registration, login, session, and profile flows;
- direct messaging and group conversations;
- group member management, permissions, and settings;
- servers, rooms, channel access, and server settings;
- replies, editing, forwarding, search, message statuses, unread state, and typing state;
- reactions and polls;
- attachments, media presentation, downloads, GIFs, audio files, and voice messages;
- stickers and custom emoji presentation;
- appearance, notification, privacy, and device-oriented settings;
- persistent one-to-one audio-call infrastructure, history, recovery logic, and focused tests;
- Tauri 2 desktop packaging and release-validation scripts.

This baseline is a development snapshot. It does not imply a stable release or complete manual validation on every supported operating system.

## Active priorities

### 1. Reliable one-to-one audio calls

- finish server-authoritative persistent call integration;
- harden reconnect, recovery, duplicate-event, and multi-session behavior;
- validate microphone, output-device, window, fullscreen, and call-control behavior on Windows;
- preserve clear separation between persistent and legacy call authority.

### 2. Reproducible desktop releases

- make the Tauri release checks reproducible from a clean environment;
- validate Windows packaging and installation;
- document supported operating-system versions only after testing;
- publish release artifacts only when the build and rollback process are understood.

### 3. Messaging and media reliability

- harden upload, retry, cancellation, download, and failure states;
- verify large files, long messages, media albums, voice messages, and slow-network behavior;
- continue focused regression coverage for direct chats, groups, servers, and channels.

### 4. Product evidence and documentation

- add screenshots captured from a reproducible current build;
- document the client/server boundary and supported configuration;
- publish known limitations alongside releases;
- keep README claims synchronized with tested behavior.

### 5. Privacy and security model

- document the current transport, storage, session, server-trust, and device-trust model;
- define key management and recovery requirements before implementing end-to-end encryption;
- add threat modeling and independent review before using strong security claims;
- publish a private vulnerability-reporting process.

## Next

- improve server and channel permission/moderation workflows;
- strengthen keyboard navigation, focus behavior, contrast, and reduced-motion support;
- validate Linux and macOS only after the Windows desktop baseline is repeatable;
- define update delivery, migration, compatibility, and release-channel policies;
- improve diagnostics without exposing message or credential data.

## Later

- video calls after persistent audio calls are reliable;
- screen sharing and active media renegotiation after the call lifecycle is stable;
- broader multi-device continuity and recovery work;
- a separately scoped mobile client, if the desktop and server foundations justify it.

## Not currently claimed

- a stable public release;
- verified end-to-end encryption;
- an independent security audit;
- production suitability for sensitive communications;
- complete Windows, Linux, and macOS parity;
- video calls or screen sharing as stable features;
- guaranteed roadmap dates.
