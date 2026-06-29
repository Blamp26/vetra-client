import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Socket } from "phoenix";
import { loadLoadEnv } from "./shared.mjs";

const env = loadLoadEnv();

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;

    const [flag, inlineValue] = token.split("=", 2);
    if (inlineValue !== undefined) {
      parsed[flag.slice(2)] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[flag.slice(2)] = "true";
      continue;
    }

    parsed[flag.slice(2)] = next;
    index += 1;
  }

  return parsed;
}

const args = parseArgs(process.argv.slice(2));

function fail(message) {
  throw new Error(message);
}

function info(message) {
  console.log(`[load] ${message}`);
}

function warn(message) {
  console.warn(`[load] WARNING: ${message}`);
}

function requireEnv(name) {
  const value = env[name];
  if (!value) {
    fail(`Missing required environment variable ${name}.`);
  }

  return value;
}

function envInt(name, fallback) {
  const raw = env[name];
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    fail(`Environment variable ${name} must be a positive integer.`);
  }

  return parsed;
}

function envNumber(name, fallback) {
  const raw = env[name];
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    fail(`Environment variable ${name} must be a positive number.`);
  }

  return parsed;
}

function buildConfig() {
  const mode = args.mode || env.VETRA_LOAD_MODE || "connect";
  const allowedModes = new Set([
    "connect",
    "channel-messages",
    "dm-messages",
    "call-signaling",
    "soak",
  ]);

  if (!allowedModes.has(mode)) {
    fail(`Unsupported VETRA_LOAD_MODE "${mode}".`);
  }

  const writeEnabled =
    args.write === "1" ||
    args.write === "true" ||
    env.VETRA_LOAD_WRITE === "1";

  const config = {
    apiUrl: requireEnv("VETRA_LOAD_API_URL").replace(/\/+$/, ""),
    socketUrl: requireEnv("VETRA_LOAD_SOCKET_URL"),
    username: env.VETRA_LOAD_USERNAME || "",
    password: env.VETRA_LOAD_PASSWORD || "",
    secondUsername: env.VETRA_LOAD_SECOND_USERNAME || "",
    secondPassword: env.VETRA_LOAD_SECOND_PASSWORD || "",
    vus: envInt("VETRA_LOAD_VUS", 10),
    durationSeconds: envInt("VETRA_LOAD_DURATION_SECONDS", 60),
    messagesPerSecond: envNumber("VETRA_LOAD_MESSAGES_PER_SECOND", 5),
    rampBatchSize: envInt("VETRA_LOAD_RAMP_BATCH_SIZE", 25),
    rampBatchDelayMs: envInt("VETRA_LOAD_RAMP_BATCH_DELAY_MS", 1000),
    mode,
    writeEnabled,
    writeResults: env.VETRA_LOAD_WRITE_RESULTS !== "0",
  };

  if (!config.username || !config.password) {
    fail(
      "Missing primary load credentials. Set VETRA_LOAD_USERNAME and VETRA_LOAD_PASSWORD in .env.load or the shell environment.",
    );
  }

  return config;
}

let config = null;
let loadPrefix = "";

function authHeaders(token) {
  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

function assertLoadContent(content) {
  if (!content || !content.startsWith("[load-test]")) {
    fail("Generated load-test content must start with [load-test].");
  }
}

function assertRoomTarget(roomId, roomRef) {
  if (roomId === null || roomId === undefined || roomId === "") {
    fail("Missing room/channel numeric id for load test.");
  }

  if (roomRef === null || roomRef === undefined || roomRef === "") {
    fail("Missing room/channel ref for load test.");
  }

  if (String(roomRef).startsWith("[load-test]")) {
    fail("Invalid room/channel ref. Message content leaked into the topic target.");
  }
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
  info(`Backend origin reachable: ${origin} (${rootResponse.status})`);

  const apiResponse = await fetch(apiBaseUrl, { method: "GET" });
  info(`API base reachable: ${apiBaseUrl} (${apiResponse.status})`);
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

  return response;
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

  return ticket;
}

async function fetchConversationPreviews(apiBaseUrl, auth) {
  const previews = await fetchJson(`${apiBaseUrl}/conversations`, {
    headers: authHeaders(auth.token),
  });
  return Array.isArray(previews) ? previews : [];
}

async function fetchRooms(apiBaseUrl, auth) {
  const rooms = await fetchJson(`${apiBaseUrl}/rooms`, {
    headers: authHeaders(auth.token),
  });
  return Array.isArray(rooms) ? rooms : [];
}

async function fetchServers(apiBaseUrl, auth) {
  const servers = await fetchJson(`${apiBaseUrl}/servers`, {
    headers: authHeaders(auth.token),
  });
  return Array.isArray(servers) ? servers : [];
}

async function fetchServerChannels(apiBaseUrl, auth, serverRef) {
  const channels = await fetchJson(`${apiBaseUrl}/servers/${serverRef}/channels`, {
    headers: authHeaders(auth.token),
  });
  return Array.isArray(channels) ? channels : [];
}

async function searchUsers(apiBaseUrl, auth, query) {
  const params = new URLSearchParams({ q: query });
  const result = await fetchJson(`${apiBaseUrl}/users/search?${params}`, {
    headers: authHeaders(auth.token),
  });
  return result ?? { users: [], servers: [] };
}

function firstArrayItem(value) {
  return Array.isArray(value) && value.length > 0 ? value[0] : null;
}

function createMetrics(mode, vus, durationSeconds) {
  return {
    mode,
    vus,
    durationSeconds,
    startedAt: new Date().toISOString(),
    startedVus: 0,
    totalSocketConnects: 0,
    successfulJoins: 0,
    failedJoins: 0,
    messagesAttempted: 0,
    messagesAcked: 0,
    messagesFailed: 0,
    receivedBroadcasts: 0,
    disconnectCount: 0,
    connectLatenciesMs: [],
    joinLatenciesMs: [],
    ackLatenciesMs: [],
    errorsByType: {},
  };
}

function recordError(metrics, error) {
  const key = error instanceof Error ? error.message : String(error);
  metrics.errorsByType[key] = (metrics.errorsByType[key] ?? 0) + 1;
}

function percentile(sorted, ratio) {
  if (sorted.length === 0) return null;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1),
  );
  return sorted[index];
}

function buildLatencyStats(latencies) {
  if (latencies.length === 0) {
    return { p50: null, p95: null, p99: null, max: null };
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1],
  };
}

function approxMessagesPerSecond(metrics) {
  if (metrics.durationSeconds <= 0) return 0;
  return Number((metrics.messagesAcked / metrics.durationSeconds).toFixed(2));
}

function summarizeMetrics(metrics) {
  return {
    duration: metrics.durationSeconds,
    virtualUsers: metrics.vus,
    targetMode: metrics.mode,
    totalSocketConnects: metrics.totalSocketConnects,
    successfulJoins: metrics.successfulJoins,
    failedJoins: metrics.failedJoins,
    messagesAttempted: metrics.messagesAttempted,
    messagesAcked: metrics.messagesAcked,
    messagesFailed: metrics.messagesFailed,
    receivedBroadcasts: metrics.receivedBroadcasts,
    disconnectCount: metrics.disconnectCount,
    approximateMessagesPerSecond: approxMessagesPerSecond(metrics),
    latenciesMs: buildLatencyStats(metrics.ackLatenciesMs),
    connectLatenciesMs: buildLatencyStats(metrics.connectLatenciesMs),
    joinLatenciesMs: buildLatencyStats(metrics.joinLatenciesMs),
    errorsByType: metrics.errorsByType,
  };
}

function printSummary(metrics) {
  const summary = summarizeMetrics(metrics);
  console.log("\n[load] Summary");
  console.log(`mode: ${summary.targetMode}`);
  console.log(`duration: ${summary.duration}s`);
  console.log(`virtual users: ${summary.virtualUsers}`);
  console.log(`started VUs: ${metrics.startedVus}`);
  console.log(`socket connects: ${summary.totalSocketConnects}`);
  console.log(`successful joins: ${summary.successfulJoins}`);
  console.log(`failed joins: ${summary.failedJoins}`);
  console.log(`messages attempted: ${summary.messagesAttempted}`);
  console.log(`messages acked: ${summary.messagesAcked}`);
  console.log(`messages failed: ${summary.messagesFailed}`);
  console.log(`received broadcasts: ${summary.receivedBroadcasts}`);
  console.log(`disconnect count: ${summary.disconnectCount}`);
  console.log(`approx msg/sec: ${summary.approximateMessagesPerSecond}`);
  console.log(
    `ack latency ms: p50=${summary.latenciesMs.p50 ?? "-"} p95=${summary.latenciesMs.p95 ?? "-"} p99=${summary.latenciesMs.p99 ?? "-"} max=${summary.latenciesMs.max ?? "-"}`,
  );
  console.log(
    `connect latency ms: p50=${summary.connectLatenciesMs.p50 ?? "-"} p95=${summary.connectLatenciesMs.p95 ?? "-"} p99=${summary.connectLatenciesMs.p99 ?? "-"} max=${summary.connectLatenciesMs.max ?? "-"}`,
  );
  console.log(
    `join latency ms: p50=${summary.joinLatenciesMs.p50 ?? "-"} p95=${summary.joinLatenciesMs.p95 ?? "-"} p99=${summary.joinLatenciesMs.p99 ?? "-"} max=${summary.joinLatenciesMs.max ?? "-"}`,
  );
  console.log(`errors by type: ${JSON.stringify(summary.errorsByType)}`);
}

function writeResults(metrics) {
  if (!config.writeResults) return;

  mkdirSync(resolve(process.cwd(), "load-results"), { recursive: true });
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "-");
  const filePath = resolve(
    process.cwd(),
    "load-results",
    `vetra-load-${stamp}.json`,
  );
  writeFileSync(
    filePath,
    JSON.stringify({ config, summary: summarizeMetrics(metrics), metrics }, null, 2),
  );
  info(`Wrote JSON results to ${filePath}`);
}

function joinChannel(channel, label, metrics) {
  return new Promise((resolve, reject) => {
    const joinStartedAt = performance.now();

    channel
      .join()
      .receive("ok", (payload) => {
        metrics.successfulJoins += 1;
        metrics.joinLatenciesMs.push(performance.now() - joinStartedAt);
        resolve(payload);
      })
      .receive("error", (resp) => {
        metrics.failedJoins += 1;
        reject(new Error(`${label} join failed: ${resp?.reason ?? "unknown error"}`));
      })
      .receive("timeout", () => {
        metrics.failedJoins += 1;
        reject(new Error(`${label} join timed out`));
      });
  });
}

function pushOk(channel, event, payload, label, metrics) {
  const startedAt = performance.now();
  metrics.messagesAttempted += 1;

  return new Promise((resolve, reject) => {
    channel
      .push(event, payload)
      .receive("ok", (response) => {
        metrics.messagesAcked += 1;
        metrics.ackLatenciesMs.push(performance.now() - startedAt);
        resolve(response);
      })
      .receive("error", (resp) => {
        metrics.messagesFailed += 1;
        reject(
          new Error(
            `${label} failed: ${resp?.reason ?? resp?.error ?? JSON.stringify(resp)}`,
          ),
        );
      })
      .receive("timeout", () => {
        metrics.messagesFailed += 1;
        reject(new Error(`${label} timed out`));
      });
  });
}

function onSocketOpen(socket) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const startedAt = performance.now();

    socket.onOpen(() => {
      if (settled) return;
      settled = true;
      resolve(performance.now() - startedAt);
    });

    socket.onError((error) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error("Socket open failed"));
    });

    socket.connect();
  });
}

async function openUserSession(label, auth, metrics) {
  if (typeof WebSocket === "undefined") {
    fail("This Node runtime does not expose a global WebSocket implementation.");
  }

  const ticket = await createSocketTicket(config.apiUrl, auth);
  const socket = new Socket(config.socketUrl, {
    params: { socket_ticket: ticket.socket_ticket },
    transport: WebSocket,
    reconnectAfterMs: () => 10000,
  });

  socket.onClose(() => {
    metrics.disconnectCount += 1;
  });

  socket.onError((error) => {
    recordError(metrics, error instanceof Error ? error : new Error("Socket error"));
  });

  const connectLatency = await onSocketOpen(socket);
  metrics.totalSocketConnects += 1;
  metrics.connectLatenciesMs.push(connectLatency);

  const userChannel = socket.channel(`user:${auth.user.id}`, {});
  userChannel.on("new_message", () => {
    metrics.receivedBroadcasts += 1;
  });
  userChannel.on("new_room_message", () => {
    metrics.receivedBroadcasts += 1;
  });
  userChannel.on("incoming_call", () => {
    metrics.receivedBroadcasts += 1;
  });

  await joinChannel(userChannel, `${label} user:${auth.user.id}`, metrics);
  metrics.startedVus += 1;

  return {
    label,
    auth,
    socket,
    userChannel,
    roomChannels: new Map(),
    callChannel: null,
  };
}

function closeSession(session) {
  try {
    session.callChannel?.leave();
  } catch {}

  for (const channel of session.roomChannels.values()) {
    try {
      channel.leave();
    } catch {}
  }

  try {
    session.userChannel.leave();
  } catch {}

  try {
    session.socket.disconnect();
  } catch {}
}

async function resolveTargets(primaryAuth, secondaryAuth) {
  const [conversationPreviews, servers] = await Promise.all([
    fetchConversationPreviews(config.apiUrl, primaryAuth),
    fetchServers(config.apiUrl, primaryAuth),
  ]);

  let secondaryTarget = null;
  if (secondaryAuth) {
    const search = await searchUsers(
      config.apiUrl,
      primaryAuth,
      secondaryAuth.user.username,
    );
    secondaryTarget =
      search.users?.find(
        (user) =>
          user.id === secondaryAuth.user.id ||
          user.public_id === secondaryAuth.user.public_id,
      ) ?? null;
  }

  const directTarget =
    firstArrayItem(conversationPreviews) ??
    (secondaryTarget
      ? {
          partner_id: secondaryTarget.id,
          partner_public_id: secondaryTarget.public_id ?? secondaryTarget.id,
          partner_username: secondaryTarget.username,
        }
      : null);

  let channelTarget = null;
  const firstServer = firstArrayItem(servers);
  if (firstServer) {
    const channels = await fetchServerChannels(
      config.apiUrl,
      primaryAuth,
      firstServer.public_id ?? firstServer.id,
    );
    const firstChannel = firstArrayItem(channels);
    if (firstChannel) {
      channelTarget = {
        roomId: firstChannel.id,
        roomRef: firstChannel.public_id ?? firstChannel.id,
        serverName: firstServer.name,
        channelName: firstChannel.name,
      };
    }
  }

  return {
    directTarget,
    secondaryTarget,
    channelTarget,
  };
}

async function ensureRoomChannel(session, target, metrics) {
  assertRoomTarget(target.roomId, target.roomRef);

  if (session.roomChannels.has(target.roomId)) {
    return session.roomChannels.get(target.roomId);
  }

  const roomChannel = session.socket.channel(`room:${target.roomRef}`, {});
  roomChannel.on("new_room_message", () => {
    metrics.receivedBroadcasts += 1;
  });
  await joinChannel(roomChannel, `${session.label} room:${target.roomRef}`, metrics);
  session.roomChannels.set(target.roomId, roomChannel);
  return roomChannel;
}

async function ensureCallChannel(session, metrics) {
  if (session.callChannel) return session.callChannel;

  const callRef = session.auth.user.public_id ?? session.auth.user.id;
  const channel = session.socket.channel(`call:${callRef}`, {});
  channel.on("offer", () => {
    metrics.receivedBroadcasts += 1;
  });
  channel.on("answer", () => {
    metrics.receivedBroadcasts += 1;
  });
  channel.on("ice_candidate", () => {
    metrics.receivedBroadcasts += 1;
  });
  channel.on("hang_up", () => {
    metrics.receivedBroadcasts += 1;
  });

  await joinChannel(channel, `${session.label} call:${callRef}`, metrics);
  session.callChannel = channel;
  return channel;
}

async function createSessions(primaryAuth, metrics) {
  const sessions = [];

  for (let index = 0; index < config.vus; index += config.rampBatchSize) {
    const batchEnd = Math.min(config.vus, index + config.rampBatchSize);
    const batchIndices = [];

    for (let cursor = index; cursor < batchEnd; cursor += 1) {
      batchIndices.push(cursor);
    }

    try {
      const batchSessions = await Promise.all(
        batchIndices.map((cursor) =>
          openUserSession(`vu-${cursor + 1}`, primaryAuth, metrics),
        ),
      );
      sessions.push(...batchSessions);
      info(`Started ${sessions.length}/${config.vus} VUs`);
    } catch (error) {
      if (isSocketTicketRateLimit(error)) {
        fail(
          `socket-ticket rate limited before target VU count was reached; reduce VETRA_LOAD_RAMP_BATCH_SIZE or increase VETRA_LOAD_RAMP_BATCH_DELAY_MS (started ${sessions.length}/${config.vus} VUs)`,
        );
      }

      throw error;
    }

    if (batchEnd < config.vus) {
      await sleep(config.rampBatchDelayMs);
    }
  }

  return sessions;
}

function createTicker(callback, intervalMs) {
  let active = false;
  let timer = null;

  const tick = async () => {
    if (!active) return;
    try {
      await callback();
    } finally {
      if (active) {
        timer = setTimeout(tick, intervalMs);
      }
    }
  };

  return {
    start() {
      if (active) return;
      active = true;
      timer = setTimeout(tick, intervalMs);
    },
    stop() {
      active = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isSocketTicketRateLimit(error) {
  return (
    error instanceof Error &&
    error.message.includes("/auth/socket-ticket") &&
    error.message.includes("HTTP 429")
  );
}

async function runConnectMode(sessions) {
  info(`Keeping ${sessions.length} user-channel connections open for ${config.durationSeconds}s`);
  await sleep(config.durationSeconds * 1000);
}

async function runChannelMessageMode(sessions, metrics, target, options = {}) {
  if (!target) {
    if (config.writeEnabled) {
      fail("Write mode requested but no channel target exists.");
    }
    info("No channel target available; staying in passive connect-only mode.");
    await sleep(config.durationSeconds * 1000);
    return;
  }

  for (const session of sessions) {
    await ensureRoomChannel(session, target, metrics);
  }

  if (!config.writeEnabled) {
    info("Write mode is disabled; joined channel topic only.");
    await sleep(config.durationSeconds * 1000);
    return;
  }

  warn("Write mode enabled. This will send tagged [load-test] channel messages.");
  const rate = options.messagesPerSecond ?? config.messagesPerSecond;
  const intervalMs = Math.max(50, Math.floor(1000 / rate));
  let sendIndex = 0;

  const ticker = createTicker(async () => {
    const session = sessions[sendIndex % sessions.length];
    sendIndex += 1;

    try {
      const roomChannel = await ensureRoomChannel(session, target, metrics);
      const content = `${loadPrefix} channel message vu=${session.label} n=${sendIndex}`;
      assertLoadContent(content);
      await pushOk(
        roomChannel,
        "send_message",
        {
          content,
          media_file_id: null,
          reply_to_id: null,
        },
        "channel load message",
        metrics,
      );
    } catch (error) {
      recordError(metrics, error);
    }
  }, intervalMs);

  ticker.start();
  await sleep(config.durationSeconds * 1000);
  ticker.stop();
}

async function runDmMessageMode(sessions, metrics, target) {
  if (!target) {
    if (config.writeEnabled) {
      fail("Write mode requested but no DM target exists.");
    }
    info("No DM target available; staying in passive connect-only mode.");
    await sleep(config.durationSeconds * 1000);
    return;
  }

  if (!config.writeEnabled) {
    info("Write mode is disabled; DM mode will keep user channels open only.");
    await sleep(config.durationSeconds * 1000);
    return;
  }

  warn("Write mode enabled. This will send tagged [load-test] DM messages.");
  const partnerRef = target.partner_public_id ?? target.partner_id;
  const intervalMs = Math.max(50, Math.floor(1000 / config.messagesPerSecond));
  let sendIndex = 0;

  const ticker = createTicker(async () => {
    const session = sessions[sendIndex % sessions.length];
    sendIndex += 1;

    const content = `${loadPrefix} dm message vu=${session.label} n=${sendIndex}`;
    assertLoadContent(content);

    try {
      await pushOk(
        session.userChannel,
        "send_message",
        {
          recipient_id: partnerRef,
          content,
          media_file_id: null,
          reply_to_id: null,
        },
        "dm load message",
        metrics,
      );
    } catch (error) {
      recordError(metrics, error);
    }
  }, intervalMs);

  ticker.start();
  await sleep(config.durationSeconds * 1000);
  ticker.stop();
}

async function runCallSignalingMode(primarySessions, metrics, secondaryAuth) {
  for (const session of primarySessions) {
    await ensureCallChannel(session, metrics);
  }

  info("Real media load is peer-to-peer/TURN and is not covered by this backend signaling test.");

  if (!config.writeEnabled) {
    info("Call-signaling mode is read-only by default. Joined call channels only.");
    await sleep(config.durationSeconds * 1000);
    return;
  }

  if (!secondaryAuth) {
    fail("Call-signaling write mode requires VETRA_LOAD_SECOND_USERNAME and VETRA_LOAD_SECOND_PASSWORD.");
  }

  warn("Write mode enabled. This will send signaling-only [load-test] offer/answer/ice/hang_up events.");
  const callee = await openUserSession("callee", secondaryAuth, metrics);
  try {
    await ensureCallChannel(callee, metrics);

    const caller = primarySessions[0];
    const callerCallRef = caller.auth.user.public_id ?? caller.auth.user.id;
    const calleeCallRef = callee.auth.user.public_id ?? callee.auth.user.id;
    let cycle = 0;
    const intervalMs = Math.max(200, Math.floor(1000 / config.messagesPerSecond));

    const ticker = createTicker(async () => {
      cycle += 1;
      const callId = `load-${Date.now()}-${cycle}`;

      try {
        await pushOk(
          caller.callChannel,
          "offer",
          {
            sdp: `${loadPrefix} offer ${callId}`,
            to_user_id: calleeCallRef,
          },
          "call offer",
          metrics,
        );

        await pushOk(
          callee.callChannel,
          "answer",
          {
            sdp: `${loadPrefix} answer ${callId}`,
            to_user_id: callerCallRef,
            call_id: callId,
          },
          "call answer",
          metrics,
        );

        await pushOk(
          caller.callChannel,
          "ice_candidate",
          {
            candidate: {
              candidate: `candidate:${callId}`,
              sdpMid: "0",
              sdpMLineIndex: 0,
            },
            to_user_id: calleeCallRef,
            call_id: callId,
          },
          "call ice_candidate",
          metrics,
        );

        await pushOk(
          caller.callChannel,
          "hang_up",
          {
            call_id: callId,
            to_user_id: calleeCallRef,
          },
          "call hang_up",
          metrics,
        );
      } catch (error) {
        recordError(metrics, error);
      }
    }, intervalMs);

    ticker.start();
    await sleep(config.durationSeconds * 1000);
    ticker.stop();
  } finally {
    closeSession(callee);
  }
}

async function runSoakMode(sessions, metrics, target) {
  const statsTicker = setInterval(() => {
    const summary = summarizeMetrics(metrics);
    console.log(
      `[load] soak stats: connects=${summary.totalSocketConnects} joins=${summary.successfulJoins}/${summary.failedJoins} acked=${summary.messagesAcked} failed=${summary.messagesFailed} broadcasts=${summary.receivedBroadcasts}`,
    );
  }, 5000);

  try {
    await runChannelMessageMode(sessions, metrics, target, {
      messagesPerSecond: Math.min(config.messagesPerSecond, 2),
    });
  } finally {
    clearInterval(statsTicker);
  }
}

async function main() {
  config = buildConfig();
  loadPrefix = `[load-test] ${new Date().toISOString()}`;

  if (config.writeEnabled && config.mode !== "connect") {
    warn(
      "Write mode is enabled. Tagged [load-test] data will be sent to the configured LAN backend.",
    );
  }

  await probeBackend(config.apiUrl);
  const primaryAuth = await login(
    config.apiUrl,
    config.username,
    config.password,
    "primary",
  );
  const secondaryAuth =
    config.secondUsername && config.secondPassword
      ? await login(
          config.apiUrl,
          config.secondUsername,
          config.secondPassword,
          "secondary",
        )
      : null;

  const metrics = createMetrics(config.mode, config.vus, config.durationSeconds);
  const sessions = [];

  try {
    const targets = await resolveTargets(primaryAuth, secondaryAuth);
    sessions.push(...(await createSessions(primaryAuth, metrics)));

    switch (config.mode) {
      case "connect":
        await runConnectMode(sessions);
        break;
      case "channel-messages":
        await runChannelMessageMode(sessions, metrics, targets.channelTarget);
        break;
      case "dm-messages":
        await runDmMessageMode(sessions, metrics, targets.directTarget);
        break;
      case "call-signaling":
        await runCallSignalingMode(sessions, metrics, secondaryAuth);
        break;
      case "soak":
        await runSoakMode(sessions, metrics, targets.channelTarget);
        break;
      default:
        fail(`Unsupported mode ${config.mode}`);
    }
  } catch (error) {
    recordError(metrics, error);
    throw error;
  } finally {
    for (const session of sessions) {
      closeSession(session);
    }
  }

  printSummary(metrics);
  writeResults(metrics);
}

await main().catch((error) => {
  console.error(`\n[load] FAILED: ${error.message}`);
  process.exitCode = 1;
});
