import { Socket } from "phoenix";
import { loadSmokeEnv } from "./shared.mjs";

const env = loadSmokeEnv();
const writeEnabled =
  process.argv.includes("--write") || env.VETRA_SMOKE_WRITE === "1";

function requireEnv(name) {
  const value = env[name];
  if (!value) {
    fail(`Missing required environment variable ${name}.`);
  }

  return value;
}

function fail(message) {
  throw new Error(message);
}

function logStep(message) {
  console.log(`\n[smoke] ${message}`);
}

function ok(message) {
  console.log(`[ok] ${message}`);
}

function skip(message) {
  console.log(`[skip] ${message}`);
}

function authHeaders(token) {
  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...options.headers,
    },
  });

  const text = await response.text();
  let body = null;

  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const details =
      typeof body === "object" && body !== null
        ? body.error || body.message || JSON.stringify(body)
        : String(body);
    throw new Error(`HTTP ${response.status} for ${url}: ${details}`);
  }

  if (body && typeof body === "object" && "data" in body) {
    return body.data;
  }

  return body;
}

async function probeBackend(apiBaseUrl) {
  const origin = new URL(apiBaseUrl).origin;

  const rootResponse = await fetch(origin, { method: "GET" });
  ok(`Backend origin reachable: ${origin} (${rootResponse.status})`);

  const apiResponse = await fetch(apiBaseUrl, { method: "GET" });
  ok(`API base reachable: ${apiBaseUrl} (${apiResponse.status})`);
}

async function login(apiBaseUrl, username, password, label) {
  const response = await fetchJson(`${apiBaseUrl}/users/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response?.token || !response?.user?.id) {
    fail(`${label} login response is missing token or user payload.`);
  }

  ok(`${label} login succeeded as ${response.user.username}`);
  return response;
}

async function fetchCurrentUser(apiBaseUrl, auth) {
  const userRef = auth.user.public_id ?? auth.user.id;
  const profile = await fetchJson(`${apiBaseUrl}/users/${userRef}`, {
    headers: authHeaders(auth.token),
  });

  if (!profile?.id) {
    fail("Current user fetch did not return a user payload.");
  }

  ok(`Fetched current user profile for ${profile.username}`);
  return profile;
}

async function createSocketTicket(apiBaseUrl, auth) {
  const ticket = await fetchJson(`${apiBaseUrl}/auth/socket-ticket`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(auth.token),
    },
    body: JSON.stringify({}),
  });

  if (!ticket?.socket_ticket || typeof ticket.socket_ticket !== "string") {
    fail("Socket ticket response is missing socket_ticket.");
  }

  if (
    ticket.expires_in !== undefined &&
    typeof ticket.expires_in !== "number"
  ) {
    fail("Socket ticket response contains a non-numeric expires_in value.");
  }

  ok("Socket ticket response shape is valid");
  return ticket;
}

async function connectUserSocket(socketUrl, auth, ticket) {
  if (typeof WebSocket === "undefined") {
    fail(
      "This Node runtime does not expose a global WebSocket implementation, so socket smoke checks cannot run.",
    );
  }

  const socket = new Socket(socketUrl, {
    params: ticket?.socket_ticket ? { socket_ticket: ticket.socket_ticket } : { token: auth.token },
    transport: WebSocket,
  });

  socket.connect();

  const userChannel = socket.channel(`user:${auth.user.id}`, {});
  await joinChannel(userChannel, `user:${auth.user.id}`);
  ok(`Joined Phoenix user channel user:${auth.user.id}`);

  return { socket, userChannel };
}

function joinChannel(channel, label) {
  return new Promise((resolve, reject) => {
    channel
      .join()
      .receive("ok", resolve)
      .receive("error", (resp) =>
        reject(new Error(`${label} join failed: ${resp?.reason ?? "unknown error"}`)),
      )
      .receive("timeout", () =>
        reject(new Error(`${label} join timed out`)),
      );
  });
}

function pushOk(channel, event, payload, label) {
  return new Promise((resolve, reject) => {
    channel
      .push(event, payload)
      .receive("ok", resolve)
      .receive("error", (resp) =>
        reject(
          new Error(
            `${label} failed: ${resp?.reason ?? resp?.error ?? JSON.stringify(resp)}`,
          ),
        ),
      )
      .receive("timeout", () => reject(new Error(`${label} timed out`)));
  });
}

async function fetchConversationPreviews(apiBaseUrl, auth) {
  const previews = await fetchJson(`${apiBaseUrl}/conversations`, {
    headers: authHeaders(auth.token),
  });

  ok(`Fetched ${Array.isArray(previews) ? previews.length : 0} conversation previews`);
  return Array.isArray(previews) ? previews : [];
}

async function fetchRooms(apiBaseUrl, auth) {
  const rooms = await fetchJson(`${apiBaseUrl}/rooms`, {
    headers: authHeaders(auth.token),
  });

  ok(`Fetched ${Array.isArray(rooms) ? rooms.length : 0} room previews`);
  return Array.isArray(rooms) ? rooms : [];
}

async function fetchServers(apiBaseUrl, auth) {
  const servers = await fetchJson(`${apiBaseUrl}/servers`, {
    headers: authHeaders(auth.token),
  });

  ok(`Fetched ${Array.isArray(servers) ? servers.length : 0} servers`);
  return Array.isArray(servers) ? servers : [];
}

async function fetchServerChannels(apiBaseUrl, auth, serverRef) {
  const channels = await fetchJson(`${apiBaseUrl}/servers/${serverRef}/channels`, {
    headers: authHeaders(auth.token),
  });

  ok(`Fetched ${Array.isArray(channels) ? channels.length : 0} channels for server ${serverRef}`);
  return Array.isArray(channels) ? channels : [];
}

async function fetchServerMembers(apiBaseUrl, auth, serverRef) {
  const members = await fetchJson(`${apiBaseUrl}/servers/${serverRef}/members`, {
    headers: authHeaders(auth.token),
  });

  ok(`Fetched ${Array.isArray(members) ? members.length : 0} members for server ${serverRef}`);
  return Array.isArray(members) ? members : [];
}

async function fetchRoomMessages(apiBaseUrl, auth, roomRef, label) {
  const messages = await fetchJson(
    `${apiBaseUrl}/rooms/${roomRef}/messages?limit=5`,
    {
      headers: authHeaders(auth.token),
    },
  );

  ok(`Fetched ${Array.isArray(messages) ? messages.length : 0} messages for ${label}`);
  return Array.isArray(messages) ? messages : [];
}

async function fetchDirectMessages(apiBaseUrl, auth, partnerRef, label) {
  const messages = await fetchJson(
    `${apiBaseUrl}/conversations/${partnerRef}?limit=5`,
    {
      headers: authHeaders(auth.token),
    },
  );

  ok(`Fetched ${Array.isArray(messages) ? messages.length : 0} direct messages for ${label}`);
  return Array.isArray(messages) ? messages : [];
}

async function searchUsers(apiBaseUrl, auth, query) {
  const params = new URLSearchParams({ q: query });
  const result = await fetchJson(`${apiBaseUrl}/users/search?${params}`, {
    headers: authHeaders(auth.token),
  });

  ok(`User search for "${query}" returned ${Array.isArray(result?.users) ? result.users.length : 0} users`);
  return result ?? { users: [], servers: [] };
}

async function sendDirectSmokeMessage(userChannel, recipientRef) {
  const response = await pushOk(
    userChannel,
    "send_message",
    {
      recipient_id: recipientRef,
      content: `${smokePrefix} direct message`,
      media_file_id: null,
      reply_to_id: null,
    },
    "direct smoke message",
  );

  if (!response?.id) {
    fail("Direct smoke message did not return a message id.");
  }

  ok(`Sent direct smoke message ${response.id}`);
  return response;
}

async function sendRoomSmokeMessage(socket, roomId, roomRef) {
  const roomChannel = socket.channel(`room:${roomRef}`, {});
  await joinChannel(roomChannel, `room:${roomRef}`);

  const response = await pushOk(
    roomChannel,
    "send_message",
    {
      content: `${smokePrefix} channel message`,
      media_file_id: null,
      reply_to_id: null,
    },
    "channel smoke message",
  );

  if (!response?.id) {
    fail("Channel smoke message did not return a message id.");
  }

  ok(`Sent channel smoke message ${response.id}`);
  return { roomChannel, message: response, roomId };
}

async function toggleDirectReaction(userChannel, recipientRef, messageId, emoji) {
  await pushOk(
    userChannel,
    "toggle_reaction",
    {
      message_id: messageId,
      emoji,
      partner_id: recipientRef,
    },
    "direct reaction toggle",
  );
}

async function toggleRoomReaction(roomChannel, messageId, emoji) {
  await pushOk(
    roomChannel,
    "toggle_reaction",
    {
      message_id: messageId,
      emoji,
    },
    "room reaction toggle",
  );
}

function firstArrayItem(value) {
  return Array.isArray(value) && value.length > 0 ? value[0] : null;
}

async function main() {
  const primaryUsername = env.VETRA_SMOKE_USERNAME || "";
  const primaryPassword = env.VETRA_SMOKE_PASSWORD || "";
  const secondaryUsername = env.VETRA_SMOKE_SECOND_USERNAME || "";
  const secondaryPassword = env.VETRA_SMOKE_SECOND_PASSWORD || "";

  if (!primaryUsername || !primaryPassword) {
    fail(
      "Missing primary smoke credentials. Set VETRA_SMOKE_USERNAME and VETRA_SMOKE_PASSWORD in .env.smoke or the shell environment.",
    );
  }

  const apiBaseUrl = requireEnv("VETRA_SMOKE_API_URL").replace(/\/+$/, "");
  const socketUrl = requireEnv("VETRA_SMOKE_SOCKET_URL");

  const smokePrefix = `[smoke-test] ${new Date().toISOString()}`;

  logStep("Probing backend reachability");
  await probeBackend(apiBaseUrl);

  logStep("Logging in");
  const primaryAuth = await login(
    apiBaseUrl,
    primaryUsername,
    primaryPassword,
    "Primary user",
  );
  const secondaryAuth =
    secondaryUsername && secondaryPassword
      ? await login(
          apiBaseUrl,
          secondaryUsername,
          secondaryPassword,
          "Secondary user",
        )
      : null;

  logStep("Checking authenticated endpoints");
  await fetchCurrentUser(apiBaseUrl, primaryAuth);
  const ticket = await createSocketTicket(apiBaseUrl, primaryAuth);

  logStep("Checking socket connectivity");
  const socketSession = await connectUserSocket(
    socketUrl,
    primaryAuth,
    ticket,
  );

  logStep("Fetching previews and collections");
  const [conversationPreviews, rooms, servers] = await Promise.all([
    fetchConversationPreviews(apiBaseUrl, primaryAuth),
    fetchRooms(apiBaseUrl, primaryAuth),
    fetchServers(apiBaseUrl, primaryAuth),
  ]);

  let secondaryUserFromSearch = null;
  if (secondaryAuth) {
    const searchResult = await searchUsers(
      apiBaseUrl,
      primaryAuth,
      secondaryAuth.user.username,
    );
    secondaryUserFromSearch =
      searchResult.users?.find(
        (user) => user.id === secondaryAuth.user.id || user.public_id === secondaryAuth.user.public_id,
      ) ?? null;
  }

  const directTarget =
    firstArrayItem(conversationPreviews) ??
    (secondaryUserFromSearch
      ? {
          partner_id: secondaryUserFromSearch.id,
          partner_public_id:
            secondaryUserFromSearch.public_id ?? secondaryUserFromSearch.id,
          partner_username: secondaryUserFromSearch.username,
        }
      : null);

  if (directTarget) {
    const directRef =
      directTarget.partner_public_id ?? directTarget.partner_id;
    await fetchDirectMessages(
      apiBaseUrl,
      primaryAuth,
      directRef,
      `direct target ${directTarget.partner_username ?? directTarget.partner_id}`,
    );
  } else {
    skip("No direct conversation target found and no secondary user provided");
  }

  const groupRoom = rooms.find((room) => room.server_id == null) ?? null;
  if (groupRoom) {
    await fetchRoomMessages(
      apiBaseUrl,
      primaryAuth,
      groupRoom.public_id ?? groupRoom.id,
      `room ${groupRoom.name}`,
    );
  } else {
    skip("No standalone group room available for read-only room message check");
  }

  let firstChannel = null;
  if (servers.length > 0) {
    const server = servers[0];
    const serverRef = server.public_id ?? server.id;
    await fetchServerMembers(apiBaseUrl, primaryAuth, serverRef);
    const channels = await fetchServerChannels(
      apiBaseUrl,
      primaryAuth,
      serverRef,
    );
    firstChannel = firstArrayItem(channels);

    if (firstChannel) {
      await fetchRoomMessages(
        apiBaseUrl,
        primaryAuth,
        firstChannel.public_id ?? firstChannel.id,
        `channel ${firstChannel.name}`,
      );
    } else {
      skip(`Server ${server.name} has no channels to smoke-check`);
    }
  } else {
    skip("No server available for server/channel smoke checks");
  }

  if (writeEnabled) {
    logStep("Running write-mode smoke checks");

    if (!secondaryAuth || !secondaryUserFromSearch) {
      skip("Write-mode direct message check skipped because no second smoke user was provided");
    } else {
      const partnerRef =
        secondaryUserFromSearch.public_id ?? secondaryUserFromSearch.id;
      const directMessage = await sendDirectSmokeMessage(
        socketSession.userChannel,
        partnerRef,
        smokePrefix,
      );
      await toggleDirectReaction(
        socketSession.userChannel,
        partnerRef,
        directMessage.id,
        "✅",
      );
      await toggleDirectReaction(
        socketSession.userChannel,
        partnerRef,
        directMessage.id,
        "✅",
      );
      ok(`Added and removed a reaction on direct smoke message ${directMessage.id}`);
    }

    if (firstChannel) {
      const roomRef = firstChannel.public_id ?? firstChannel.id;
      const roomSmoke = await sendRoomSmokeMessage(
        socketSession.socket,
        roomRef,
        smokePrefix,
      );
      await toggleRoomReaction(roomSmoke.roomChannel, roomSmoke.message.id, "✅");
      await toggleRoomReaction(roomSmoke.roomChannel, roomSmoke.message.id, "✅");
      roomSmoke.roomChannel.leave();
      ok(`Added and removed a reaction on channel smoke message ${roomSmoke.message.id}`);
    } else {
      skip("Write-mode channel message check skipped because no server channel was available");
    }

    skip("Tiny file upload smoke check is not implemented because the client repo does not expose a safe documented upload-only endpoint for a non-destructive release check");
  } else {
    skip("Write-mode message send and reaction checks are disabled. Set VETRA_SMOKE_WRITE=1 or use npm run smoke:lan:write to enable them.");
  }

  socketSession.userChannel.leave();
  socketSession.socket.disconnect();
  ok("Smoke test completed");
}

await main().catch((error) => {
  console.error(`\n[smoke] FAILED: ${error.message}`);
  process.exitCode = 1;
});
