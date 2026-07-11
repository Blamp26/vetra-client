# ADR: Vetra client architecture and Codebase Memory bootstrap

- Status: accepted; bootstrap snapshot
- Project: `mnt-games-vetra-repos-vetra-client`
- Related Vetra project: `mnt-games-vetra-repos-vetra-server`
- Indexed branch: `main`
- Indexed commit: `96bd7bb81b38a9fca3b1e06216a8246a7cca3c98`
- Indexed root: `/mnt/games/vetra/repos/vetra-client`

## Project purpose and responsibility

The client is Vetra's desktop-first messenger UI. It owns presentation, interaction, local session/UI state, REST request composition, Phoenix client socket integration, media presentation, notifications, and WebRTC call behavior. The server remains authoritative for identity, permissions, durable messages and media metadata, room/server membership, realtime fanout, and call signaling state.

## Languages, frameworks, and important dependencies

The indexed graph contains TypeScript (161 files), JavaScript (5), Rust/Tauri (3), TOML, YAML, CSS, and HTML. The runtime stack is React 18, Vite 5, TypeScript, Phoenix JS client 1.7, Zustand, React Router, Tailwind CSS 4, Radix UI primitives, Framer Motion, Vitest/testing-library, and Tauri 2 with shell and notification plugins. Browser WebRTC APIs implement peer media and screen sharing. Rust is the Tauri host layer; the application UI is primarily TypeScript/React.

## Main entry points

- Vite development/build configuration: `vite.config.ts`.
- React application surface: `src/App.tsx` and `src/main.tsx` (verify exact bootstrap wiring if changing startup).
- Shared REST transport: `src/api/base.ts`, especially `request`, `get`, `post`, `put`, `del`, and `postFormData`.
- Phoenix/WebSocket integration: `src/services/socket.ts`, especially `connectSocket`, `resolveSocketAuthParams`, and `joinRoomChannel`.
- Global state: `src/store/index.ts` and `src/store/slices/*`.
- Desktop host: `src-tauri/` and its Cargo/Tauri configuration.
- Operational scripts: `scripts/load-vetra.mjs`, `scripts/smoke-vetra.mjs`, and release checks.

The graph's automatically detected entry-point list is noisy because it includes `.agents` tooling. Treat the source entry points above as the application-oriented map and verify them with `search_graph` before edits.

## Package, directory, and subsystem map

- `src/api`: typed REST wrappers for auth, users, messages, rooms, servers, and media upload/base transport.
- `src/services`: socket manager, event buses, call signaling, WebRTC, notifications, and other long-lived integrations.
- `src/store`: persisted Zustand store and slices for auth, servers/channels, rooms, messages, presence, audio, and UI.
- `src/features`: registration/auth, messaging, calling, server/channel, profile, and other user-facing feature modules.
- `src/shared`: reusable components, hooks, types, utilities, error boundaries, and authenticated media rendering.
- `src-tauri`: native desktop shell and plugins.
- `scripts`: smoke/load/release helpers; these can target the server without being part of the UI runtime.
- `.agents` and `skills`: development/agent tooling; the graph contains many of these nodes and they should not be mistaken for product subsystems.

The graph reports 5,155 nodes, 13,716 edges, 284 files, and major call boundaries from `features` to `store` (121), `shared` (85), `api` (20), and `services` (17). `store`, `shared`, and `api` are the main core boundaries.

## Runtime architecture

Vite serves the React application during development and builds the web assets consumed by Tauri. React feature components call typed API services and subscribe to a singleton-like socket manager. The socket manager owns the Phoenix `Socket`, the authenticated user channel, per-room channels, event buses, and teardown. Zustand exposes the cross-feature state contract. Tauri supplies desktop lifecycle, shell, and notification capabilities.

The REST base URL is `VITE_API_URL` or a development default. The server's corresponding REST prefix is `/api/v1`, so the client path strings are relative to that configured base.

## State and data flow

1. Auth/session state is loaded from storage into the auth slice; API responses update the current user, token/session, and socket manager.
2. REST list/detail calls hydrate server, room, conversation, message, and media state. Normalizers convert server payloads and attachment metadata into client models.
3. Phoenix user/room events update Zustand slices through socket event handlers. Room messages append to the active conversation and update previews/unread counts; presence and typing update presence/UI slices.
4. The socket manager maintains room-local buses to prevent duplicate joins and provides explicit unsubscribe/leave paths.
5. Calls keep transient WebRTC peer/media state in calling hooks/services, while Phoenix carries signaling events; call media itself is peer-to-peer where WebRTC permits.

## Authentication and authorization flow

REST login and registration use `POST /users/login` and `POST /users/register`. The shared request helper reads the stored bearer token and sends `Authorization: Bearer <token>` for authenticated requests. After authentication, `createSocketTicket` calls `POST /auth/socket-ticket`; `resolveSocketAuthParams` prefers the returned `socket_ticket` and falls back to the stored bearer token. The Phoenix socket sends those parameters to `/socket`.

The server is authoritative for token validity, socket-ticket validity, room/server membership, and action authorization. Client route guards and UI visibility are convenience behavior, not security boundaries. Do not introduce a client-only authorization decision without matching server enforcement.

## REST/API routes and HTTP edges

The indexed client graph has 10 route nodes and 12 `HTTP_CALLS` edges. Confirmed client wrappers include:

- Auth: `POST /users/register`, `POST /users/login`, `GET /users/search`, `GET /users/:id`, `PUT /users/:id/profile`, `POST /auth/socket-ticket`.
- Conversations/messages: conversation list/detail/search; room message list/search; these dynamic GETs are present in source but are not all represented as graph HTTP edges.
- Rooms: list/create, messages/search, add member, delete.
- Servers: list/create, channels, members, add/remove member, delete.
- Media: upload/download paths are used by the client media components and upload services; verify exact wrapper names with `search_graph` when changing media behavior.

The graph directly resolved these client-to-route relationships: auth login/register/socket ticket/profile, room/server membership, server channel creation, and room/server deletion. Server route matching is currently not represented as cross-project graph edges; the server ADR records the authoritative route table.

## WebSocket, Phoenix Channel, and asynchronous event flow

The client uses Phoenix JS channels over the server's `/socket` endpoint:

- `user:<userRef>`: auth-scoped status, presence, typing, delivery/read, server/room lifecycle, room-summary, and incoming call events.
- `room:<roomRef>`: `new_room_message`, `typing_start`, `typing_stop`, `message_edited`, `message_deleted`, and `reaction_updated`; `joinRoomChannel` binds these to a per-room event bus.
- `call:<userRef>`: WebRTC signaling (`offer`, `answer`, ICE candidates, `renegotiate`, `hang_up`); incoming calls are also announced on the user channel.

The client additionally sends channel commands for messages, typing, edits/deletes, reactions, presence/status, and call signaling. Async/event fanout is a server concern; the client must tolerate reconnects, duplicate/late events, channel join failures, and teardown races.

## Storage and persistence

The client persists session/UI data through its storage helpers and Zustand store; browser/Tauri storage is not the system of record. Media is displayed through authenticated image/video components and server media URLs. Durable users, servers, rooms, messages, reactions, and media files live in the server database and filesystem/object storage path managed by the server.

## Build, test, development, and deployment workflow

- `npm run dev` starts Vite; `npm run build` runs TypeScript plus Vite production build; `npm run preview` serves the build.
- `npm test` runs Vitest; `npm run test:call-stress` targets WebRTC stress coverage.
- `npm run tauri:dev` and `npm run tauri:build` develop/package the desktop application.
- `npm run smoke:lan`, `npm run load:lan`, and their modes exercise REST/channel/call paths against a running server.
- `npm run check:release` and `check:release:tauri` validate release artifacts.

Verify current package-manager, signing, CI, and release-host details with the repository scripts/configuration before deployment; they are not fully captured in the graph.

## Important architectural invariants

- API paths and payloads must remain compatible with the server's `/api/v1` contract and JSON envelope/attachment normalization.
- Bearer-token REST auth and socket-ticket/socket fallback auth must remain aligned with server authentication.
- Resource references may be numeric or public identifiers; preserve the shared `ResourceRef` behavior.
- Socket joins are idempotent per logical room and all listeners must be unsubscribed on feature teardown.
- Room/user/call event names are protocol surface, not local implementation details.
- UI state updates must distinguish direct conversation messages, active room messages, previews, unread counts, and summary fanout.
- WebRTC teardown must stop tracks, leave the call channel, and clear transient state even when sockets or components disappear.

## High-risk or tightly coupled areas

- `src/services/socket.ts` couples auth-ticket acquisition, Phoenix channel topic names, event names, reconnect behavior, room buses, and all messaging/calling consumers.
- `src/store/slices/*` is a high-fan-in contract used by most features; changing model shape has broad impact.
- `src/features/calling/*` and `webrtcService.ts` are timing-sensitive and coupled to server call events and browser WebRTC state machines.
- Media URL/authentication and message attachment normalization span API, store, rendering components, and server media endpoints.
- Public IDs versus numeric IDs affect every REST/channel reference.

## Client/server integration points

Related project: `mnt-games-vetra-repos-vetra-server`.

- REST: client `src/api/*` calls server `VetraWeb.Router` controllers under `/api/v1`; the strongest confirmed edges are auth, profile, room/server membership, channel creation, and deletion.
- Auth: client `authApi.createSocketTicket` -> server `AuthController.socket_ticket` -> signed ticket; client sends ticket to server `VetraWeb.UserSocket` at `/socket`.
- Realtime: client `socket.ts` topic joins/events correspond to server `RoomChannel`, `UserChannel`, `CallChannel`, and `UserSocket`.
- Data: client message/room/server/presence slices consume server JSON presenters and channel broadcasts; server persists and authorizes the underlying records.
- Calls: client `CallSignalingService`/`WebRTCService` exchanges SDP/ICE/control events with server `CallChannel` and `CallSession`.

Cross-repo intelligence was run against the exact related project and produced zero formal `CROSS_HTTP_CALLS`, `CROSS_ASYNC_CALLS`, or `CROSS_CHANNEL` edges. The source-level protocol relationships above are therefore authoritative bootstrap documentation, while the lack of graph edges is an index limitation to revisit.

## Known uncertainties requiring future verification

- The client graph has route nodes without HTTP methods/handlers, and its HTTP extraction misses several dynamic GET/upload routes.
- The server graph has no `Route` node label and no HTTP/async/channel edge labels even though targeted source searches find the router, endpoint, and Phoenix channels.
- Cross-repo matching cannot currently prove exact route/channel pairs automatically; rerun after the server index extracts routes/channels.
- Confirm the production `VITE_API_URL`, socket URL derivation, media storage backend, and desktop release/signing pipeline.
- Confirm whether all room summary events are still consumed by the current UI or are compatibility paths.
- The graph's application entry-point detection is polluted by `.agents` scripts; verify startup symbols before changing boot behavior.

## Guidance for future agents

Use `get_architecture(project="mnt-games-vetra-repos-vetra-client")` for orientation, then `search_graph`/`semantic_query` for features or symbols and `trace_path` for callers/dependencies. Use `query_graph` for route/edge counts and cross-project patterns; use `search_code` for literals, config, event names, and route strings. Call `get_code_snippet` after resolving an exact qualified name and before reading a large file. Call `detect_changes` before and after non-trivial edits when available. For any task involving auth, REST, sockets, rooms, messages, media, or calls, search both this project and `mnt-games-vetra-repos-vetra-server`. Treat this ADR as a snapshot: prefer current graph/source when it contradicts stale text.
