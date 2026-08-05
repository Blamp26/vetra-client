<div align="center">

# Vetra

**A desktop-first messenger for direct chats, groups, servers, files, and calls.**

![Status](https://img.shields.io/badge/status-active_development-f0ad4e)
![Tauri](https://img.shields.io/badge/desktop-Tauri_2-24C8D8?logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/frontend-React_18-61DAFB?logo=react&logoColor=black)
![Languages](https://img.shields.io/badge/languages-TypeScript_%2B_Rust-3178C6)

</div>

> [!IMPORTANT]
> Vetra is an active development project, not a public production release. The current client has not been independently security-audited and does **not** provide verified end-to-end encryption. Do not use it for sensitive communications.

## What Vetra is

Vetra is a Tauri-first desktop messenger designed for day-long communication on a laptop or desktop. The product direction is intentionally calm and practical: conversations stay central, controls behave like desktop controls, and the interface avoids decorative SaaS-style chrome.

This repository contains the **desktop client only**. A compatible Vetra server is required for accounts, persistent data, authorization, realtime events, files, and call coordination.

## Current development snapshot

The table below describes what exists in the current source tree and automated test coverage. It is **not** a claim that every flow has completed release, cross-platform, or independent security validation.

| Area | Current state |
| --- | --- |
| Registration, login, session handling, and profile editing | Implemented in the development client |
| Direct conversations and realtime message updates | Implemented in the development client |
| Group creation, member management, permissions, and settings | Implemented in the development client |
| Servers, rooms, channel access, and server settings | Implemented in the development client |
| Replies, editing, forwarding, search, statuses, unread state, and typing state | Implemented in the development client |
| Reactions and polls | Implemented in the development client |
| File, image, video, audio, GIF, and voice-message flows | Implemented in the development client; release hardening is ongoing |
| Stickers and custom emoji presentation | Implemented in the development client |
| Appearance, notification, privacy, and device-oriented settings | Implemented in the development client |
| Persistent one-to-one audio calls and call history | Implemented and tested at source level; runtime and recovery hardening is ongoing |
| Tauri desktop packaging | Development and release checks exist; no public stable build is published |
| Video calls and screen sharing | Not part of the current stable call scope |
| Verified end-to-end encryption | Not implemented or audited |
| Public stable release | Not available |

## Product principles

- **Conversation first.** Navigation and controls should orient the user without dominating the message surface.
- **Desktop-native feedback.** Hover, focus, loading, error, window, media, and call states should be explicit.
- **Dense but readable.** Vetra favors an efficient desktop layout over oversized cards and empty space.
- **No fake security language.** Security properties are documented only after they exist, are tested, and can be verified.
- **No fake UI.** Product claims should correspond to wired flows rather than disconnected mock controls.

See [`PRODUCT.md`](PRODUCT.md) for product intent and [`DESIGN.md`](DESIGN.md) for the current visual system.

## Roadmap

The roadmap is maintained in [`ROADMAP.md`](ROADMAP.md). It intentionally separates current capabilities, active work, and later ideas without invented release dates.

Near-term priorities are:

1. harden persistent one-to-one audio calls, recovery, and device behavior;
2. complete reproducible Windows/Tauri release validation;
3. improve messaging, attachment, and media reliability;
4. publish verified screenshots and release artifacts;
5. document the privacy and security model before making stronger claims.

## Screenshots

Verified product screenshots are not yet committed to this repository. They should be added only after they are captured from a reproducible desktop build and match the current source.

## Technology

| Layer | Technology |
| --- | --- |
| Desktop shell | Tauri 2, Rust |
| Interface | React 18, TypeScript, Vite |
| Styling and UI primitives | Tailwind CSS, Radix UI, Phosphor/Lucide icons, Framer Motion |
| Client state | Zustand |
| Realtime transport | Phoenix client |
| Calls | WebRTC with server-authoritative call lifecycle |
| Tests | Vitest, Testing Library, focused integration and stress tests |
| Validation | TypeScript/build checks, Tauri release checks, LAN smoke/load scripts |

## Repository layout

```text
vetra-client/
├── src/                 # React application and product features
├── src-tauri/           # Tauri 2 desktop shell and Rust integrations
├── scripts/             # Release, smoke, and load validation helpers
├── docs/                # Protocol, deployment, and design documentation
├── test/                # Shared fixtures and supporting test assets
├── PRODUCT.md           # Product purpose and principles
├── DESIGN.md            # Visual language and component rules
└── AGENTS.md            # Repository-specific engineering guidance
```

## Run locally

### Prerequisites

- Node.js and npm
- Rust `1.77.2` or newer
- the platform prerequisites required by Tauri 2
- access to a compatible Vetra server

### Install

```bash
git clone https://github.com/Blamp26/vetra-client.git
cd vetra-client
npm ci
```

Copy `.env.example` to `.env.local`, then configure the server endpoints you actually use:

```env
VITE_API_URL=http://localhost:4000/api/v1
VITE_SOCKET_URL=ws://localhost:4000/socket
```

Optional WebRTC, TURN, diagnostics, and GIF-provider variables are documented in [`.env.example`](.env.example).

### Start the desktop client

```bash
npm run tauri:dev
```

For the browser-hosted development UI only:

```bash
npm run dev
```

## Validation

Common checks include:

```bash
npm test -- --run
npm run build
npm run check:release
npm run check:release:tauri
```

When Rust or Tauri files change:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Some LAN smoke, load, call, and Windows-runtime checks require a configured server or manual desktop validation. Passing browser or source-level tests must not be presented as proof of Windows runtime behavior.

## Contributing

Vetra is still changing quickly. Before a substantial change:

1. read [`AGENTS.md`](AGENTS.md);
2. inspect the existing implementation and focused tests;
3. keep the change bounded;
4. distinguish source inspection, automated evidence, and manual runtime verification;
5. avoid adding UI or security claims that are not backed by working behavior.

## Security

Vetra has not completed an independent security audit. The repository must not claim end-to-end encryption, production-grade privacy, or suitability for sensitive communication until those properties are implemented, documented, tested, and reviewed.

## License

No open-source license has been published for this repository yet. Until a license file is added, do not assume permission to use, modify, or redistribute the code.
