import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
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

function envNonNegativeInt(name, fallback) {
  const raw = env[name];
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    fail(`Environment variable ${name} must be a non-negative integer.`);
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

function rateToIntervalMs(rate) {
  if (!Number.isFinite(rate) || rate <= 0) {
    fail("Message rate must be a positive number.");
  }

  return 1000 / rate;
}

function envFlag(name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }

  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;

  fail(`Environment variable ${name} must be 1, 0, true, or false.`);
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
  const joinRoomDuringStartupDefault = mode === "channel-messages";

  const config = {
    apiUrl: env.VETRA_LOAD_API_URL?.replace(/\/+$/, "") || "",
    socketUrl: env.VETRA_LOAD_SOCKET_URL || "",
    username: env.VETRA_LOAD_USERNAME || "",
    password: env.VETRA_LOAD_PASSWORD || "",
    secondUsername: env.VETRA_LOAD_SECOND_USERNAME || "",
    secondPassword: env.VETRA_LOAD_SECOND_PASSWORD || "",
    vus: envInt("VETRA_LOAD_VUS", 10),
    durationSeconds: envInt("VETRA_LOAD_DURATION_SECONDS", 60),
    messagesPerSecond: envNumber("VETRA_LOAD_MESSAGES_PER_SECOND", 5),
    // Example for higher-throughput write tests:
    // VETRA_LOAD_MESSAGES_PER_SECOND=20
    // VETRA_LOAD_MESSAGE_MAX_IN_FLIGHT=50
    messageMaxInFlight: envNonNegativeInt(
      "VETRA_LOAD_MESSAGE_MAX_IN_FLIGHT",
      1,
    ),
    messageTimeoutMs: envInt("VETRA_LOAD_MESSAGE_TIMEOUT_MS", 15000),
    rampBatchSize: envInt("VETRA_LOAD_RAMP_BATCH_SIZE", 25),
    rampBatchDelayMs: envInt("VETRA_LOAD_RAMP_BATCH_DELAY_MS", 1000),
    startupTimeoutMs: envInt("VETRA_LOAD_STARTUP_TIMEOUT_MS", 15000),
    roomRampBatchSize: envInt(
      "VETRA_LOAD_ROOM_RAMP_BATCH_SIZE",
      envInt("VETRA_LOAD_RAMP_BATCH_SIZE", 25),
    ),
    roomRampBatchDelayMs: envInt(
      "VETRA_LOAD_ROOM_RAMP_BATCH_DELAY_MS",
      envInt("VETRA_LOAD_RAMP_BATCH_DELAY_MS", 1000),
    ),
    joinRoomDuringStartup: envFlag(
      "VETRA_LOAD_JOIN_ROOM_DURING_STARTUP",
      joinRoomDuringStartupDefault,
    ),
    roomJoinTimeoutMs: envInt(
      "VETRA_LOAD_ROOM_JOIN_TIMEOUT_MS",
      envInt("VETRA_LOAD_STARTUP_TIMEOUT_MS", 15000),
    ),
    roomBatchTimeoutMs: null,
    serverMonitorEnabled: env.VETRA_LOAD_SERVER_MONITOR === "1",
    serverSsh: env.VETRA_LOAD_SERVER_SSH || "superadmin@192.168.88.26",
    serverService:
      env.VETRA_LOAD_SERVER_SERVICE || "vetra-server.service",
    serverPort: envInt("VETRA_LOAD_SERVER_PORT", 4000),
    serverSampleIntervalMs: envInt(
      "VETRA_LOAD_SERVER_SAMPLE_INTERVAL_MS",
      1000,
    ),
    monitorSshTimeoutMs: envInt(
      "VETRA_LOAD_MONITOR_SSH_TIMEOUT_MS",
      5000,
    ),
    serverMonitorDebug: env.VETRA_LOAD_SERVER_MONITOR_DEBUG === "1",
    serverMonitorOnly: env.VETRA_LOAD_SERVER_MONITOR_ONLY === "1",
    mode,
    writeEnabled,
    writeResults: env.VETRA_LOAD_WRITE_RESULTS !== "0",
    maxErrorDetails: envInt("VETRA_LOAD_MAX_ERROR_DETAILS", 50),
  };

  config.roomBatchTimeoutMs = envInt(
    "VETRA_LOAD_ROOM_BATCH_TIMEOUT_MS",
    config.roomJoinTimeoutMs + 5000,
  );

  config.serverSsh = String(config.serverSsh ?? "").trim();
  config.serverService = String(config.serverService ?? "").trim();
  config.serverPort = String(config.serverPort ?? "").trim();

  if (config.serverMonitorEnabled) {
    if (!config.serverService) {
      fail("VETRA_LOAD_SERVER_SERVICE resolved to empty");
    }

    if (!config.serverPort) {
      fail("VETRA_LOAD_SERVER_PORT resolved to empty");
    }
  }

  if (config.serverMonitorOnly) {
    if (!config.serverMonitorEnabled) {
      fail("VETRA_LOAD_SERVER_MONITOR_ONLY=1 requires VETRA_LOAD_SERVER_MONITOR=1.");
    }
    return config;
  }

  if (!config.apiUrl) {
    fail("Missing required environment variable VETRA_LOAD_API_URL.");
  }

  if (!config.socketUrl) {
    fail("Missing required environment variable VETRA_LOAD_SOCKET_URL.");
  }

  if (!config.username || !config.password) {
    fail(
      "Missing primary load credentials. Set VETRA_LOAD_USERNAME and VETRA_LOAD_PASSWORD in .env.load or the shell environment.",
    );
  }

  return config;
}

function describeMessageRateSource() {
  const rawEnvValue = process.env.VETRA_LOAD_MESSAGES_PER_SECOND;
  const mergedEnvValue = env.VETRA_LOAD_MESSAGES_PER_SECOND;

  if (rawEnvValue !== undefined && rawEnvValue !== null && rawEnvValue !== "") {
    return "process.env";
  }

  if (mergedEnvValue !== undefined && mergedEnvValue !== null && mergedEnvValue !== "") {
    return ".env.load";
  }

  return "default";
}

let config = null;
let loadPrefix = "";
let shutdownRequested = false;
let isCleaningUp = false;
const activeSessions = new Set();
let interruptResolver = null;
const interruptPromise = new Promise((resolve) => {
  interruptResolver = resolve;
});

function execFileAsync(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        rejectPromise(
          new Error(stderr?.trim() || error.message || "execFile failed"),
        );
        return;
      }

      resolvePromise({ stdout, stderr });
    });
  });
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function requestShutdown(reason = "SIGINT") {
  if (shutdownRequested) return;
  shutdownRequested = true;
  warn(`${reason} received. Stopping load test and cleaning up active sockets.`);
  interruptResolver?.();
}

function makeStepTimeoutError(step, timeoutMs) {
  return new Error(`${step} timeout after ${timeoutMs}ms`);
}

function withTimeout(promiseFactory, step, timeoutMs, onTimeout) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(async () => {
      if (settled) return;
      settled = true;
      try {
        await onTimeout?.();
      } catch {}
      reject(makeStepTimeoutError(step, timeoutMs));
    }, timeoutMs);

    Promise.resolve()
      .then(() => promiseFactory())
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

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

async function createSocketTicket(apiBaseUrl, auth, options = {}) {
  const ticket = await fetchJson(`${apiBaseUrl}/auth/socket-ticket`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(auth.token),
    },
    signal: options.signal,
    body: JSON.stringify({}),
  });

  if (!ticket?.socket_ticket || typeof ticket.socket_ticket !== "string") {
    fail("Socket ticket response is missing socket_ticket.");
  }

  return ticket;
}

async function createSocketTicketWithTimeout(auth, metrics, timeoutMs) {
  const controller = new AbortController();
  metrics.socketTicketRequests += 1;

  try {
    return await withTimeout(
      () =>
        createSocketTicket(config.apiUrl, auth, {
          signal: controller.signal,
        }),
      "socket-ticket request",
      timeoutMs,
      async () => {
        controller.abort();
      },
    );
  } catch (error) {
    recordSocketTicketFailure(metrics, error);
    throw error;
  }
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
    startupFailures: 0,
    totalSocketConnects: 0,
    socketTicketRequests: 0,
    socketTicketFailures: 0,
    socketTicketFailuresByType: {},
    socketConnectDeniedExpiredTicket: 0,
    socketConnectFailuresByType: {},
    requestedUserChannelJoins: 0,
    successfulUserChannelJoins: 0,
    failedUserChannelJoins: 0,
    successfulJoins: 0,
    failedJoins: 0,
    requestedRoomJoins: 0,
    successfulRoomJoins: 0,
    failedRoomJoins: 0,
    controlledRoomJoinFailures: 0,
    messagesAttempted: 0,
    messagesAcked: 0,
    messagesFailed: 0,
    maxMessageInFlightObserved: 0,
    finalMessageInFlightCount: 0,
    skippedSendTicksMaxInFlight: 0,
    skippedSendsMaxInFlight: 0,
    receivedBroadcasts: 0,
    receivedBroadcastsByEvent: {},
    receivedBroadcastsByTopicType: {},
    expectedCloses: 0,
    cleanupCloses: 0,
    earlySocketDisconnects: 0,
    earlySocketDisconnectsByPhase: {},
    unexpectedDisconnects: 0,
    unexpectedDisconnectsByPhase: {},
    socketCloseCodes: {},
    socketCloseReasons: {},
    socketCloseDetailsSample: [],
    runtimeSocketErrors: 0,
    messageFailureDetailsSample: [],
    disconnectCount: 0,
    connectLatenciesMs: [],
    joinLatenciesMs: [],
    ackLatenciesMs: [],
    errorsByType: {},
    startupErrorsByType: {},
    roomJoinFailuresByType: {},
    schedulerRequestedMessageRate: null,
    schedulerExpectedSendsByElapsedDuration: 0,
    schedulerWakeCount: 0,
    schedulerCatchUpSends: 0,
    schedulerLagMs: [],
    schedulerEffectiveMessagesPerSecond: null,
    serverMonitor: {
      enabled: false,
      samples: [],
      errors: [],
    },
  };
}

function recordError(metrics, error) {
  const key = error instanceof Error ? error.message : String(error);
  metrics.errorsByType[key] = (metrics.errorsByType[key] ?? 0) + 1;
}

function recordStartupError(metrics, error) {
  const key = error instanceof Error ? error.message : String(error);
  metrics.startupErrorsByType[key] = (metrics.startupErrorsByType[key] ?? 0) + 1;
}

function recordRoomJoinFailure(metrics, error) {
  const key = error instanceof Error ? error.message : String(error);
  metrics.roomJoinFailuresByType[key] =
    (metrics.roomJoinFailuresByType[key] ?? 0) + 1;
}

function recordSocketTicketFailure(metrics, error) {
  const key = error instanceof Error ? error.message : String(error);
  metrics.socketTicketFailures += 1;
  metrics.socketTicketFailuresByType[key] =
    (metrics.socketTicketFailuresByType[key] ?? 0) + 1;
}

function recordSocketConnectFailure(metrics, error) {
  const key = error instanceof Error ? error.message : String(error);
  metrics.socketConnectFailuresByType[key] =
    (metrics.socketConnectFailuresByType[key] ?? 0) + 1;

  if (key.includes("expired_socket_ticket")) {
    metrics.socketConnectDeniedExpiredTicket += 1;
  }
}

function pushLimitedSample(target, value) {
  if (target.length >= config.maxErrorDetails) {
    return;
  }

  target.push(value);
}

function isSocketTicketError(error) {
  return (
    error instanceof Error &&
    (error.message.includes("/auth/socket-ticket") ||
      error.message.includes("socket-ticket request"))
  );
}

function recordBroadcast(metrics, topicType, event) {
  metrics.receivedBroadcasts += 1;
  metrics.receivedBroadcastsByEvent[event] =
    (metrics.receivedBroadcastsByEvent[event] ?? 0) + 1;
  metrics.receivedBroadcastsByTopicType[topicType] =
    (metrics.receivedBroadcastsByTopicType[topicType] ?? 0) + 1;
}

function recalculateDisconnectCount(metrics) {
  metrics.disconnectCount =
    metrics.cleanupCloses + metrics.earlySocketDisconnects;
}

function incrementCounter(map, key) {
  map[key] = (map[key] ?? 0) + 1;
}

function getSocketState(session) {
  try {
    return session.socket?.connectionState?.() ?? "unknown";
  } catch {
    return "unknown";
  }
}

function getChannelState(channel) {
  if (!channel) return "missing";
  try {
    if (channel.isJoined?.()) return "joined";
    if (channel.isJoining?.()) return "joining";
    if (channel.isLeaving?.()) return "leaving";
    if (channel.isClosed?.()) return "closed";
    if (channel.isErrored?.()) return "errored";
  } catch {}
  return "unknown";
}

function getRoomJoinState(session) {
  const roomChannels = [...session.roomChannels.values()];
  if (roomChannels.length === 0) {
    return "not_joined";
  }

  if (roomChannels.some((channel) => getChannelState(channel) === "joined")) {
    return "joined";
  }

  return roomChannels.map((channel) => getChannelState(channel)).join(",");
}

function resolveSessionPhase(session) {
  if (session.currentPhase && session.currentPhase !== "unknown") {
    return session.currentPhase;
  }
  if (session.cleanupStarted || isCleaningUp) return "cleanup";
  if (!session.connected) return "startup";
  if (!session.joined) return "user_join";
  if ((session.currentSendInFlightCount ?? 0) > 0 || session.currentSendInFlight) {
    return "sending";
  }
  if (session.lastRoomJoinAttempted && !session.canSendMessages) return "room_join";
  if (session.canSendMessages) return "ready";
  return "unknown";
}

function markSessionSendStarted(session) {
  session.currentSendInFlightCount = (session.currentSendInFlightCount ?? 0) + 1;
  session.currentSendInFlight = session.currentSendInFlightCount > 0;
  session.currentPhase = "sending";
}

function markSessionSendFinished(session) {
  session.currentSendInFlightCount = Math.max(
    0,
    (session.currentSendInFlightCount ?? 1) - 1,
  );
  session.currentSendInFlight = session.currentSendInFlightCount > 0;
  if (!session.currentSendInFlight) {
    session.currentPhase = session.canSendMessages
      ? "ready"
      : resolveSessionPhase(session);
  }
}

function recordSocketClose(metrics, session, event = null) {
  const phase = resolveSessionPhase(session);
  const uptimeMs =
    session.socketOpenedAt !== null
      ? Math.round(performance.now() - session.socketOpenedAt)
      : null;
  const code =
    typeof event?.code === "number"
      ? String(event.code)
      : session.socket?.closeWasClean === false
        ? "unclean"
        : "unknown";
  const reason =
    typeof event?.reason === "string" && event.reason
      ? event.reason
      : "unknown";
  const wasExpectedCleanup = !!session.expectedClose;
  const detail = {
    vuId: session.label,
    phase,
    uptimeMs,
    wasExpectedCleanup,
    closeCode: typeof event?.code === "number" ? event.code : null,
    closeReason:
      typeof event?.reason === "string" && event.reason ? event.reason : null,
    socketState: getSocketState(session),
    userChannelJoined: !!session.joined,
    roomChannelJoined: session.roomChannels.size > 0,
    eligibleForMessageSending: !!session.canSendMessages,
    userChannelState: getChannelState(session.userChannel),
    roomChannelState: getRoomJoinState(session),
  };

  incrementCounter(metrics.socketCloseCodes, code);
  incrementCounter(metrics.socketCloseReasons, reason);

  if (!wasExpectedCleanup && phase !== "cleanup") {
    incrementCounter(metrics.earlySocketDisconnectsByPhase, phase);
    if (!session.hadControlledRoomJoinFailure) {
      incrementCounter(metrics.unexpectedDisconnectsByPhase, phase);
    }
    pushLimitedSample(metrics.socketCloseDetailsSample, detail);
  }
}

function recordMessageFailure(metrics, session, error, elapsedMs, activeSenderCount, activeReceiverCount) {
  pushLimitedSample(metrics.messageFailureDetailsSample, {
    vuId: session.label,
    errorType: error instanceof Error ? error.message : String(error),
    elapsedMs: Math.round(elapsedMs),
    activeSenderCount,
    activeReceiverCount,
    socketConnected: getSocketState(session) === "open",
    socketState: getSocketState(session),
    userChannelState: getChannelState(session.userChannel),
    roomChannelState: getRoomJoinState(session),
    phase: resolveSessionPhase(session),
    eligibleForMessageSending: !!session.canSendMessages,
  });
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

function approxRate(count, durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  return Number(((count * 1000) / durationMs).toFixed(2));
}

function summarizeMetrics(metrics) {
  return {
    duration: metrics.durationSeconds,
    requestedVus: metrics.vus,
    virtualUsers: metrics.vus,
    startedVus: metrics.startedVus,
    startupFailures: metrics.startupFailures,
    targetMode: metrics.mode,
    totalSocketConnects: metrics.totalSocketConnects,
    socketTicketRequests: metrics.socketTicketRequests,
    socketTicketFailures: metrics.socketTicketFailures,
    socketTicketFailuresByType: metrics.socketTicketFailuresByType,
    socketConnectDeniedExpiredTicket: metrics.socketConnectDeniedExpiredTicket,
    socketConnectFailuresByType: metrics.socketConnectFailuresByType,
    requestedUserChannelJoins: metrics.requestedUserChannelJoins,
    successfulUserChannelJoins: metrics.successfulUserChannelJoins,
    failedUserChannelJoins: metrics.failedUserChannelJoins,
    successfulJoins: metrics.successfulJoins,
    failedJoins: metrics.failedJoins,
    requestedRoomJoins: metrics.requestedRoomJoins,
    successfulRoomJoins: metrics.successfulRoomJoins,
    failedRoomJoins: metrics.failedRoomJoins,
    controlledRoomJoinFailures: metrics.controlledRoomJoinFailures,
    messagesAttempted: metrics.messagesAttempted,
    messagesAcked: metrics.messagesAcked,
    messagesFailed: metrics.messagesFailed,
    maxMessageInFlightObserved: metrics.maxMessageInFlightObserved,
    finalMessageInFlightCount: metrics.finalMessageInFlightCount,
    skippedSendTicksMaxInFlight: metrics.skippedSendTicksMaxInFlight,
    skippedSendsMaxInFlight: metrics.skippedSendsMaxInFlight,
    receivedBroadcasts: metrics.receivedBroadcasts,
    receivedBroadcastsByEvent: metrics.receivedBroadcastsByEvent,
    receivedBroadcastsByTopicType: metrics.receivedBroadcastsByTopicType,
    disconnectCount: metrics.disconnectCount,
    expectedCloses: metrics.expectedCloses,
    cleanupCloses: metrics.cleanupCloses,
    earlySocketDisconnects: metrics.earlySocketDisconnects,
    earlySocketDisconnectsByPhase: metrics.earlySocketDisconnectsByPhase,
    unexpectedDisconnects: metrics.unexpectedDisconnects,
    unexpectedDisconnectsByPhase: metrics.unexpectedDisconnectsByPhase,
    socketCloseCodes: metrics.socketCloseCodes,
    socketCloseReasons: metrics.socketCloseReasons,
    socketCloseDetailsSample: metrics.socketCloseDetailsSample,
    runtimeSocketErrors: metrics.runtimeSocketErrors,
    messageFailureDetailsSample: metrics.messageFailureDetailsSample,
    approximateMessagesPerSecond: approxMessagesPerSecond(metrics),
    schedulerRequestedMessageRate: metrics.schedulerRequestedMessageRate,
    schedulerExpectedSendsByElapsedDuration:
      metrics.schedulerExpectedSendsByElapsedDuration,
    schedulerWakeCount: metrics.schedulerWakeCount,
    schedulerCatchUpSends: metrics.schedulerCatchUpSends,
    schedulerLagMs: buildLatencyStats(metrics.schedulerLagMs),
    schedulerEffectiveMessagesPerSecond:
      metrics.schedulerEffectiveMessagesPerSecond,
    latenciesMs: buildLatencyStats(metrics.ackLatenciesMs),
    connectLatenciesMs: buildLatencyStats(metrics.connectLatenciesMs),
    joinLatenciesMs: buildLatencyStats(metrics.joinLatenciesMs),
    errorsByType: metrics.errorsByType,
    startupErrorsByType: metrics.startupErrorsByType,
    roomJoinFailuresByType: metrics.roomJoinFailuresByType,
    serverMetrics: summarizeServerMonitor(metrics.serverMonitor),
  };
}

function printSummary(metrics) {
  const summary = summarizeMetrics(metrics);
  console.log("\n[load] Summary");
  console.log(`mode: ${summary.targetMode}`);
  console.log(`duration: ${summary.duration}s`);
  console.log(`requested VUs: ${summary.requestedVus}`);
  console.log(`started VUs: ${summary.startedVus}`);
  console.log(`startup failures: ${summary.startupFailures}`);
  console.log(`socket connects: ${summary.totalSocketConnects}`);
  console.log(`socket ticket requests: ${summary.socketTicketRequests}`);
  console.log(`socket ticket failures: ${summary.socketTicketFailures}`);
  console.log(
    `socket connect denied expired ticket: ${summary.socketConnectDeniedExpiredTicket}`,
  );
  console.log(
    `user channel joins: ${summary.successfulUserChannelJoins}/${summary.requestedUserChannelJoins}`,
  );
  console.log(`user channel join failures: ${summary.failedUserChannelJoins}`);
  console.log(
    `room channel joins: ${summary.successfulRoomJoins}/${summary.requestedRoomJoins}`,
  );
  console.log(`room channel join failures: ${summary.failedRoomJoins}`);
  console.log(`total successful joins: ${summary.successfulJoins}`);
  console.log(`total failed joins: ${summary.failedJoins}`);
  console.log(`controlled room join failures: ${summary.controlledRoomJoinFailures}`);
  console.log(`messages attempted: ${summary.messagesAttempted}`);
  console.log(`messages acked: ${summary.messagesAcked}`);
  console.log(`messages failed: ${summary.messagesFailed}`);
  console.log(`max in-flight observed: ${summary.maxMessageInFlightObserved}`);
  console.log(`final in-flight count: ${summary.finalMessageInFlightCount}`);
  console.log(
    `skipped send ticks (max in-flight): ${summary.skippedSendTicksMaxInFlight}`,
  );
  console.log(`skipped sends (max in-flight): ${summary.skippedSendsMaxInFlight}`);
  console.log(`requested msg/sec: ${summary.schedulerRequestedMessageRate ?? "-"}`);
  console.log(
    `expected sends by elapsed duration: ${summary.schedulerExpectedSendsByElapsedDuration}`,
  );
  console.log(`scheduler wakes: ${summary.schedulerWakeCount}`);
  console.log(`catch-up sends: ${summary.schedulerCatchUpSends}`);
  console.log(
    `scheduler lag ms: p50=${summary.schedulerLagMs.p50 ?? "-"} p95=${summary.schedulerLagMs.p95 ?? "-"} p99=${summary.schedulerLagMs.p99 ?? "-"} max=${summary.schedulerLagMs.max ?? "-"}`,
  );
  console.log(
    `scheduler effective msg/sec: ${summary.schedulerEffectiveMessagesPerSecond ?? "-"}`,
  );
  console.log(`received broadcasts total: ${summary.receivedBroadcasts}`);
  console.log(
    `received broadcasts by event: ${JSON.stringify(summary.receivedBroadcastsByEvent)}`,
  );
  console.log(
    `received broadcasts by topic type: ${JSON.stringify(summary.receivedBroadcastsByTopicType)}`,
  );
  console.log(`disconnect count: ${summary.disconnectCount}`);
  console.log(`expected closes: ${summary.expectedCloses}`);
  console.log(`cleanup closes: ${summary.cleanupCloses}`);
  console.log(`early socket disconnects: ${summary.earlySocketDisconnects}`);
  console.log(
    `early socket disconnects by phase: ${JSON.stringify(summary.earlySocketDisconnectsByPhase)}`,
  );
  console.log(`unexpected disconnects: ${summary.unexpectedDisconnects}`);
  console.log(
    `unexpected disconnects by phase: ${JSON.stringify(summary.unexpectedDisconnectsByPhase)}`,
  );
  console.log(`socket close codes: ${JSON.stringify(summary.socketCloseCodes)}`);
  console.log(`socket close reasons: ${JSON.stringify(summary.socketCloseReasons)}`);
  console.log(
    `socket close details sample: ${JSON.stringify(summary.socketCloseDetailsSample)}`,
  );
  console.log(`runtime socket errors: ${summary.runtimeSocketErrors}`);
  console.log(
    `message failure details sample: ${JSON.stringify(summary.messageFailureDetailsSample)}`,
  );
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
  console.log(
    `startup errors by type: ${JSON.stringify(summary.startupErrorsByType)}`,
  );
  console.log(
    `socket ticket failures by type: ${JSON.stringify(summary.socketTicketFailuresByType)}`,
  );
  console.log(
    `socket connect failures by type: ${JSON.stringify(summary.socketConnectFailuresByType)}`,
  );
  console.log(
    `room join failures by type: ${JSON.stringify(summary.roomJoinFailuresByType)}`,
  );

  if (summary.serverMetrics.enabled) {
    console.log("\n[load] Server metrics");
    console.log(`samples: ${summary.serverMetrics.sampleCount}`);
    console.log(
      `cpu %: avg=${summary.serverMetrics.cpu.avg ?? "-"} p95=${summary.serverMetrics.cpu.p95 ?? "-"} max=${summary.serverMetrics.cpu.max ?? "-"}`,
    );
    console.log(
      `rss MB: avg=${summary.serverMetrics.rssMb.avg ?? "-"} max=${summary.serverMetrics.rssMb.max ?? "-"}`,
    );
    console.log(
      `mem %: avg=${summary.serverMetrics.memPercent.avg ?? "-"} max=${summary.serverMetrics.memPercent.max ?? "-"}`,
    );
    console.log(
      `available RAM GB min=${summary.serverMetrics.availableRamGbMin ?? "-"}`,
    );
    console.log(
      `tcp :${config.serverPort} connections: avg=${summary.serverMetrics.tcpConnections.avg ?? "-"} max=${summary.serverMetrics.tcpConnections.max ?? "-"}`,
    );
    console.log(`monitor errors: ${summary.serverMetrics.monitorErrors}`);
  }
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

function average(values) {
  if (values.length === 0) return null;
  return Number(
    (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2),
  );
}

function max(values) {
  if (values.length === 0) return null;
  return Number(Math.max(...values).toFixed(2));
}

function min(values) {
  if (values.length === 0) return null;
  return Number(Math.min(...values).toFixed(2));
}

function summarizeServerMonitor(serverMonitor) {
  const enabled = !!serverMonitor?.enabled;
  const samples = serverMonitor?.samples ?? [];
  const errors = serverMonitor?.errors ?? [];
  const cpuValues = samples
    .map((sample) => sample.cpuPercent)
    .filter((value) => Number.isFinite(value));
  const rssMbValues = samples
    .map((sample) =>
      Number.isFinite(sample.rssBytes) ? sample.rssBytes / (1024 * 1024) : null,
    )
    .filter((value) => value !== null);
  const memPercentValues = samples
    .map((sample) => sample.memPercent)
    .filter((value) => Number.isFinite(value));
  const availableRamGbValues = samples
    .map((sample) =>
      Number.isFinite(sample.availableMemBytes)
        ? sample.availableMemBytes / (1024 * 1024 * 1024)
        : null,
    )
    .filter((value) => value !== null);
  const tcpValues = samples
    .map((sample) => sample.tcpPortConnections)
    .filter((value) => Number.isFinite(value));

  return {
    enabled,
    sampleCount: samples.length,
    cpu: {
      avg: average(cpuValues),
      p95: buildLatencyStats(cpuValues).p95,
      max: max(cpuValues),
    },
    rssMb: {
      avg: average(rssMbValues),
      max: max(rssMbValues),
    },
    memPercent: {
      avg: average(memPercentValues),
      max: max(memPercentValues),
    },
    availableRamGbMin: min(availableRamGbValues),
    tcpConnections: {
      avg: average(tcpValues),
      max: max(tcpValues),
    },
    monitorErrors: errors.length,
  };
}

function parseKeyValueOutput(output) {
  const values = {};

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);
    values[key] = value;
  }

  return values;
}

function parseNumberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseServerSample(output) {
  const values = parseKeyValueOutput(output);
  const rssKiB = parseNumberOrNull(values.rssKiB);
  const vszKiB = parseNumberOrNull(values.vszKiB);
  return {
    timestamp: values.timestamp ?? new Date().toISOString(),
    pid: parseNumberOrNull(values.pid),
    cpuPercent: parseNumberOrNull(values.cpuPercent),
    memPercent: parseNumberOrNull(values.memPercent),
    rssBytes: rssKiB !== null ? rssKiB * 1024 : null,
    vszBytes: vszKiB !== null ? vszKiB * 1024 : null,
    availableMemBytes: parseNumberOrNull(values.availableMemBytes),
    usedMemBytes: parseNumberOrNull(values.usedMemBytes),
    tcpPortConnections: parseNumberOrNull(values.tcpPortConnections),
    etime: values.etime ?? null,
    service: values.service ?? null,
    systemctlExitCode: parseNumberOrNull(values.systemctlExitCode),
    systemctlStderr: values.systemctlStderr ?? null,
    rawPid: values.rawPid ?? null,
    psLine: values.psLine ?? null,
  };
}

function validateServerSample(sample) {
  if (sample.availableMemBytes === null) {
    return "missing availableMemBytes";
  }

  if (sample.usedMemBytes === null) {
    return "missing usedMemBytes";
  }

  if (sample.tcpPortConnections === null) {
    return "missing tcpPortConnections";
  }

  if (sample.pid === null || sample.pid === 0) {
    return "missing pid";
  }

  if (sample.psLine) {
    const fields = sample.psLine.trim().split(/\s+/);
    if (fields.length < 5) {
      return "invalid psLine";
    }
  }

  if (sample.cpuPercent === null) {
    return "missing cpuPercent";
  }

  if (sample.memPercent === null) {
    return "missing memPercent";
  }

  if (sample.rssBytes === null) {
    return "missing rssBytes";
  }

  if (sample.vszBytes === null) {
    return "missing vszBytes";
  }

  return null;
}

function buildRemoteMonitorScript() {
  const service = shellQuote(config.serverService);
  const port = shellQuote(config.serverPort);

  return `
service=${service}
port=${port}
timestamp=$(date -Iseconds)
systemctl_err_file=$(mktemp /tmp/vetra-monitor-systemctl.XXXXXX.err)
pid=$(systemctl show "$service" -p MainPID --value 2>"$systemctl_err_file")
systemctl_exit=$?
systemctl_stderr=$(tr '\\n' ' ' < "$systemctl_err_file" | tr '\\r' ' ' | sed 's/[[:space:]]\\+/ /g; s/^ //; s/ $//')
rm -f "$systemctl_err_file"
pid=$(printf "%s" "$pid" | tr -d "\\r\\n")
echo "timestamp=$timestamp"
echo "service=$service"
echo "systemctlExitCode=$systemctl_exit"
echo "systemctlStderr=$systemctl_stderr"
echo "rawPid=$pid"
echo "pid=$pid"

if [ -n "$pid" ] && [ "$pid" != "0" ]; then
  ps_line=$(ps -p "$pid" -o %cpu=,%mem=,rss=,vsz=,etime= 2>/dev/null | head -n 1 | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
  echo "psLine=$ps_line"
  if [ -n "$ps_line" ]; then
    printf '%s\n' "$ps_line" | awk '
      NF >= 5 {
        print "cpuPercent=" $1
        print "memPercent=" $2
        print "rssKiB=" $3
        print "vszKiB=" $4
        print "etime=" $5
      }
      NF > 0 && NF < 5 {
        print "psParseError=invalid"
      }
    '
  fi
else
  echo "psLine="
fi

if free -b >/dev/null 2>&1; then
  free -b | awk '
    NR == 2 {
      print "usedMemBytes=" $3
      print "availableMemBytes=" $7
      found=1
    }
    END {
      if (!found) {
        print "freeParseError=1"
      }
    }
  '
else
  echo "freeParseError=1"
fi

if ss -tan "sport = :$port" >/dev/null 2>&1; then
  tcp=$(ss -tan "sport = :$port" 2>/dev/null | tail -n +2 | wc -l | tr -d ' ')
elif ss -tan >/dev/null 2>&1; then
  tcp=$(ss -tan 2>/dev/null | grep -c ":$port " || true)
else
  tcp=
fi

if [ -n "$tcp" ]; then
  echo "tcpPortConnections=$tcp"
else
  echo "ssParseError=1"
fi
`.trim();
}

function buildRemoteMonitorCommand() {
  return `bash -lc ${shellQuote(buildRemoteMonitorScript())}`;
}

function createServerMonitor(metrics) {
  if (!config.serverMonitorEnabled) {
    return null;
  }

  metrics.serverMonitor.enabled = true;

  let stopped = false;
  let timer = null;
  let inFlight = false;
  let warned = false;
  let debugPrinted = false;

  const runSample = async () => {
    if (stopped || inFlight) return;
    inFlight = true;

    try {
      if (config.serverMonitorDebug && !debugPrinted) {
        info(
          `server monitor config: ssh=${config.serverSsh} service=${config.serverService} port=${config.serverPort}`,
        );
      }
      const { stdout } = await execFileAsync(
        "ssh",
        [
          config.serverSsh,
          buildRemoteMonitorCommand(),
        ],
        {
          timeout: config.monitorSshTimeoutMs,
        },
      );
      if (config.serverMonitorDebug && !debugPrinted) {
        info(`server monitor raw sample:\n${stdout.trimEnd()}`);
        debugPrinted = true;
      }
      const sample = parseServerSample(stdout);
      const validationError = validateServerSample(sample);
      if (validationError) {
        metrics.serverMonitor.errors.push({
          timestamp: sample.timestamp,
          message: `server monitor parse failed: ${validationError}`,
          details: {
            reason: validationError,
            service: sample.service,
            systemctlExitCode: sample.systemctlExitCode,
            systemctlStderr: sample.systemctlStderr,
            rawPid: sample.rawPid,
            psLine: sample.psLine,
            pid: sample.pid,
            cpuPercent: sample.cpuPercent,
            memPercent: sample.memPercent,
            rssBytes: sample.rssBytes,
            vszBytes: sample.vszBytes,
            availableMemBytes: sample.availableMemBytes,
            usedMemBytes: sample.usedMemBytes,
            tcpPortConnections: sample.tcpPortConnections,
            etime: sample.etime,
          },
        });
        if (!warned) {
          warn(`server monitor parse failed: ${validationError}`);
          warned = true;
        }
      }
      metrics.serverMonitor.samples.push(sample);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      metrics.serverMonitor.errors.push({
        timestamp: new Date().toISOString(),
        message,
      });
      if (!warned) {
        warn(
          `server monitor sample failed; continuing load test without crashing (${message})`,
        );
        warned = true;
      }
    } finally {
      inFlight = false;
      if (!stopped) {
        timer = setTimeout(runSample, config.serverSampleIntervalMs);
      }
    }
  };

  return {
    start() {
      runSample();
    },
    async stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      while (inFlight) {
        await sleep(50);
      }
    },
  };
}

async function runServerMonitorOnly() {
  const metrics = createMetrics("monitor-only", 0, 0);
  const serverMonitor = createServerMonitor(metrics);

  if (!serverMonitor) {
    fail("VETRA_LOAD_SERVER_MONITOR_ONLY=1 requires VETRA_LOAD_SERVER_MONITOR=1.");
  }

  serverMonitor.start();
  await sleep(Math.max(config.serverSampleIntervalMs + 200, 1200));
  await serverMonitor.stop();

  console.log("\n[load] Monitor-only sample");
  console.log(JSON.stringify(metrics.serverMonitor.samples[0] ?? null, null, 2));
  console.log("\n[load] Monitor-only errors");
  console.log(JSON.stringify(metrics.serverMonitor.errors, null, 2));
}

function joinChannel(channel, label, metrics, timeoutMs = null) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const joinStartedAt = performance.now();
    const timer =
      timeoutMs === null
        ? null
        : setTimeout(() => {
            if (settled) return;
            settled = true;
            metrics.failedJoins += 1;
            try {
              channel.leave();
            } catch {}
            reject(makeStepTimeoutError("socket join", timeoutMs));
          }, timeoutMs);

    const settle = (callback) => (value) => {
      if (settled) return;
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      callback(value);
    };

    channel
      .join()
      .receive("ok", settle((payload) => {
        metrics.successfulJoins += 1;
        metrics.joinLatenciesMs.push(performance.now() - joinStartedAt);
        resolve(payload);
      }))
      .receive("error", settle((resp) => {
        metrics.failedJoins += 1;
        reject(new Error(`${label} join failed: ${resp?.reason ?? "unknown error"}`));
      }))
      .receive("timeout", settle(() => {
        metrics.failedJoins += 1;
        reject(new Error(`${label} join timed out`));
      }));
  });
}

function pushOk(channel, event, payload, label, metrics, timeoutMs = config.messageTimeoutMs) {
  const startedAt = performance.now();
  metrics.messagesAttempted += 1;

  return new Promise((resolve, reject) => {
    channel
      .push(event, payload, timeoutMs)
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
    const settle = (callback) => (value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };

    socket.onOpen(settle(() => {
      resolve(performance.now() - startedAt);
    }));

    socket.onError(settle((error) => {
      reject(
        error instanceof Error
          ? error
          : new Error(`Socket open failed: ${JSON.stringify(error)}`),
      );
    }));

    socket.onClose(settle((event) => {
      const code =
        typeof event?.code === "number" ? `code=${event.code}` : "code=unknown";
      const reason =
        typeof event?.reason === "string" && event.reason
          ? ` reason=${event.reason}`
          : "";
      reject(new Error(`Socket closed before open (${code}${reason})`));
    }));

    socket.connect();
  });
}

function markSessionExpectedClose(session, metrics) {
  if (
    session.socket &&
    session.connected &&
    session.joined &&
    !session.expectedClose &&
    !session.closeObserved
  ) {
    session.expectedClose = true;
    metrics.expectedCloses += 1;
    metrics.cleanupCloses += 1;
    recalculateDisconnectCount(metrics);
  }
}

async function openUserSession(label, auth, metrics, timeoutMs) {
  if (typeof WebSocket === "undefined") {
    fail("This Node runtime does not expose a global WebSocket implementation.");
  }

  const session = {
    label,
    auth,
    metricsRef: metrics,
    socket: null,
    userChannel: null,
    roomChannels: new Map(),
    callChannel: null,
    cleanupStarted: false,
    connected: false,
    joined: false,
    currentPhase: "startup",
    socketOpenedAt: null,
    canSendMessages: false,
    currentSendInFlight: false,
    currentSendInFlightCount: 0,
    lastRoomJoinAttempted: false,
    hadControlledRoomJoinFailure: false,
    expectedClose: false,
    closeObserved: false,
  };
  activeSessions.add(session);

  try {
    const ticket = await createSocketTicketWithTimeout(auth, metrics, timeoutMs);
    const socket = new Socket(config.socketUrl, {
      params: () => ({ socket_ticket: ticket.socket_ticket }),
      transport: WebSocket,
      reconnectAfterMs: () => 60 * 60 * 1000,
    });
    session.socket = socket;

    socket.onClose((event) => {
      if (session.closeObserved) {
        return;
      }

      session.closeObserved = true;
      session.currentPhase = session.expectedClose ? "cleanup" : resolveSessionPhase(session);
      activeSessions.delete(session);

      recordSocketClose(metrics, session, event);

      if (!session.connected || !session.joined) {
        recalculateDisconnectCount(metrics);
        return;
      }

      if (!isCleaningUp && !session.cleanupStarted && !session.expectedClose) {
        socket.reconnectTimer?.reset?.();
        metrics.earlySocketDisconnects += 1;
        if (!session.hadControlledRoomJoinFailure) {
          metrics.unexpectedDisconnects += 1;
        }
      }

      recalculateDisconnectCount(metrics);
    });

    socket.onError((error) => {
      if (!session.connected || !session.joined) {
        return;
      }

      if (isCleaningUp || session.cleanupStarted || session.expectedClose) {
        return;
      }

      metrics.runtimeSocketErrors += 1;
      recordError(
        metrics,
        error instanceof Error ? error : new Error("Socket error"),
      );
    });

    const connectLatency = await withTimeout(
      () => onSocketOpen(socket),
      "socket connect",
      timeoutMs,
      async () => {
        socket.reconnectTimer?.reset?.();
        try {
          socket.disconnect();
        } catch {}
      },
    );
    metrics.totalSocketConnects += 1;
    metrics.connectLatenciesMs.push(connectLatency);
    session.connected = true;
    session.socketOpenedAt = performance.now();
    session.currentPhase = "user_join";

    const userChannel = socket.channel(`user:${auth.user.id}`, {});
    session.userChannel = userChannel;
    userChannel.on("new_message", () => {
      recordBroadcast(metrics, "user", "new_message");
    });
    userChannel.on("new_room_message", () => {
      recordBroadcast(metrics, "user", "new_room_message");
    });
    userChannel.on("incoming_call", () => {
      recordBroadcast(metrics, "user", "incoming_call");
    });

    await joinChannel(
      userChannel,
      `${label} user:${auth.user.id}`,
      metrics,
      timeoutMs,
    );
    session.joined = true;
    metrics.startedVus += 1;
    metrics.successfulUserChannelJoins += 1;
    session.currentPhase = "ready";

    return session;
  } catch (error) {
    if (!isSocketTicketError(error) && !session.connected) {
      recordSocketConnectFailure(metrics, error);
    }
    closeSession(session, metrics);
    throw error;
  }
}

function closeSession(session, metrics = session.metricsRef) {
  session.cleanupStarted = true;
  session.currentPhase = "cleanup";
  if (metrics) {
    markSessionExpectedClose(session, metrics);
  }

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

function cleanupRoomChannel(session, roomId, channel = null) {
  const activeChannel = channel ?? session.roomChannels.get(roomId) ?? null;
  session.roomChannels.delete(roomId);

  if (!activeChannel) {
    return;
  }

  try {
    activeChannel.leave();
  } catch {}
}

function cleanupSessions(metrics, sessions) {
  isCleaningUp = true;
  const cleanupTargets =
    activeSessions.size > 0 ? [...activeSessions] : sessions;

  for (const session of cleanupTargets) {
    if (session.joined && !session.expectedClose) {
      markSessionExpectedClose(session, metrics);
    }
  }

  for (const session of cleanupTargets) {
    closeSession(session, metrics);
  }

  recalculateDisconnectCount(metrics);
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
    recordBroadcast(metrics, "room", "new_room_message");
  });
  await joinChannel(roomChannel, `${session.label} room:${target.roomRef}`, metrics);
  session.roomChannels.set(target.roomId, roomChannel);
  return roomChannel;
}

function createRoomJoinAttempt(session, target, metrics, vuIndex) {
  assertRoomTarget(target.roomId, target.roomRef);

  let settled = false;
  let roomChannel = null;
  let resolveAttempt = null;
  const startedAt = performance.now();
  const label = `${session.label} room:${target.roomRef}`;
  const promise = new Promise((resolve) => {
    resolveAttempt = resolve;
  });

  const finish = (result) => {
    if (settled) {
      return false;
    }

    settled = true;
    resolveAttempt(result);
    return true;
  };

  const fail = (error) => {
    const wrappedError =
      error instanceof Error ? error : new Error(String(error));

    if (!finish({ ok: false, session, error: wrappedError })) {
      return false;
    }

    metrics.failedJoins += 1;
    metrics.failedRoomJoins += 1;
    metrics.controlledRoomJoinFailures += 1;
    session.currentPhase = "room_join";
    session.hadControlledRoomJoinFailure = true;
    recordRoomJoinFailure(metrics, wrappedError);
    cleanupRoomChannel(session, target.roomId, roomChannel);
    info(
      `Failed room join for VU ${vuIndex} (${session.label}): ${wrappedError.message}`,
    );
    return true;
  };

  const succeed = () => {
    if (!finish({ ok: true, session })) {
      return false;
    }

    metrics.successfulJoins += 1;
    metrics.successfulRoomJoins += 1;
    metrics.joinLatenciesMs.push(performance.now() - startedAt);
    session.roomChannels.set(target.roomId, roomChannel);
    session.canSendMessages = true;
    session.currentPhase = "ready";
    return true;
  };

  const timeout = setTimeout(() => {
    fail(makeStepTimeoutError("room join", config.roomJoinTimeoutMs));
  }, config.roomJoinTimeoutMs);

  promise.finally(() => {
    clearTimeout(timeout);
  });

  try {
    session.lastRoomJoinAttempted = true;
    session.currentPhase = "room_join";
    if (session.roomChannels.has(target.roomId)) {
      roomChannel = session.roomChannels.get(target.roomId);
      succeed();
    } else {
      roomChannel = session.socket.channel(`room:${target.roomRef}`, {});
      roomChannel.on("new_room_message", () => {
        recordBroadcast(metrics, "room", "new_room_message");
      });
      roomChannel
        .join()
        .receive("ok", () => {
          succeed();
        })
        .receive("error", (resp) => {
          fail(new Error(`${label} join failed: ${resp?.reason ?? "unknown error"}`));
        })
        .receive("timeout", () => {
          fail(new Error(`${label} join timed out`));
        });
    }
  } catch (error) {
    fail(error);
  }

  return {
    promise,
    isSettled() {
      return settled;
    },
    failBatchTimeout(timeoutMs) {
      fail(new Error(`room join batch timeout after ${timeoutMs}ms`));
    },
    failInterrupted(reason = "room join interrupted by SIGINT") {
      fail(new Error(reason));
    },
  };
}

async function joinRoomChannels(sessions, metrics, target) {
  const joinedSessions = [];

  for (
    let index = 0;
    index < sessions.length;
    index += config.roomRampBatchSize
  ) {
    if (shutdownRequested) {
      break;
    }

    const batchEnd = Math.min(sessions.length, index + config.roomRampBatchSize);
    const batchSessions = sessions.slice(index, batchEnd);
    info(`Joining room VUs ${index + 1}-${batchEnd}/${sessions.length}`);

    metrics.requestedRoomJoins += batchSessions.length;

    const attempts = batchSessions.map((session, batchIndex) =>
      createRoomJoinAttempt(session, target, metrics, index + batchIndex + 1),
    );
    const batchPromise = Promise.allSettled(
      attempts.map((attempt) => attempt.promise),
    );
    const batchTimeout = setTimeout(() => {
      const pendingAttempts = attempts.filter((attempt) => !attempt.isSettled());
      if (pendingAttempts.length === 0) {
        return;
      }

      info(
        `Room join batch ${index + 1}-${batchEnd}/${sessions.length} timed out after ${config.roomBatchTimeoutMs}ms; marking ${pendingAttempts.length} pending VUs failed`,
      );

      for (const attempt of pendingAttempts) {
        attempt.failBatchTimeout(config.roomBatchTimeoutMs);
      }
    }, config.roomBatchTimeoutMs);

    const batchResults = await Promise.race([
      batchPromise,
      interruptPromise.then(async () => {
        const pendingAttempts = attempts.filter((attempt) => !attempt.isSettled());
        for (const attempt of pendingAttempts) {
          attempt.failInterrupted();
        }
        return batchPromise;
      }),
    ]);
    clearTimeout(batchTimeout);

    for (const result of batchResults) {
      if (result.status === "fulfilled" && result.value.ok) {
        joinedSessions.push(result.value.session);
      }
    }

    info(
      `Room joined ${joinedSessions.length}/${sessions.length} VUs, failed ${metrics.failedRoomJoins}`,
    );

    if (batchEnd < sessions.length && !shutdownRequested) {
      await sleep(config.roomRampBatchDelayMs);
    }
  }

  return joinedSessions;
}

async function joinRoomForStartup(session, metrics, target, vuIndex) {
  metrics.requestedRoomJoins += 1;
  session.lastRoomJoinAttempted = true;
  session.currentPhase = "room_join";
  const attempt = createRoomJoinAttempt(session, target, metrics, vuIndex);
  const result = await attempt.promise;
  if (result.ok) {
    session.canSendMessages = true;
    session.currentPhase = "ready";
  }
  return result.ok;
}

async function ensureCallChannel(session, metrics) {
  if (session.callChannel) return session.callChannel;

  const callRef = session.auth.user.public_id ?? session.auth.user.id;
  const channel = session.socket.channel(`call:${callRef}`, {});
  channel.on("offer", () => {
    recordBroadcast(metrics, "call", "offer");
  });
  channel.on("answer", () => {
    recordBroadcast(metrics, "call", "answer");
  });
  channel.on("ice_candidate", () => {
    recordBroadcast(metrics, "call", "ice_candidate");
  });
  channel.on("hang_up", () => {
    recordBroadcast(metrics, "call", "hang_up");
  });

  await joinChannel(channel, `${session.label} call:${callRef}`, metrics);
  session.callChannel = channel;
  return channel;
}

async function createSessions(primaryAuth, metrics, options = {}) {
  const sessions = [];
  const roomReadySessions = [];
  const roomTarget = options.roomTarget ?? null;
  const joinRoomDuringStartup =
    !!options.joinRoomDuringStartup && !!roomTarget;

  for (let index = 0; index < config.vus; index += config.rampBatchSize) {
    if (shutdownRequested) {
      break;
    }

    const batchEnd = Math.min(config.vus, index + config.rampBatchSize);
    const batchIndices = [];

    for (let cursor = index; cursor < batchEnd; cursor += 1) {
      batchIndices.push(cursor);
    }

    info(`Starting VUs ${index + 1}-${batchEnd}/${config.vus}`);
    metrics.requestedUserChannelJoins += batchIndices.length;

    const batchResults = await Promise.allSettled(
      batchIndices.map(async (cursor) => {
        const label = `vu-${cursor + 1}`;
        try {
          const session = await openUserSession(
            label,
            primaryAuth,
            metrics,
            config.startupTimeoutMs,
          );
          const roomJoined = joinRoomDuringStartup
            ? await joinRoomForStartup(
                session,
                metrics,
                roomTarget,
                cursor + 1,
              )
            : false;
          return { ok: true, session, label, roomJoined };
        } catch (error) {
          metrics.startupFailures += 1;
          metrics.failedUserChannelJoins += 1;
          const wrappedError =
            error instanceof Error ? error : new Error(String(error));
          recordStartupError(metrics, wrappedError);
          info(`Failed to start VU ${cursor + 1}: ${wrappedError.message}`);
          return { ok: false, error: wrappedError, label };
        }
      }),
    );

    let sawRateLimit = false;
    for (const result of batchResults) {
      if (result.status !== "fulfilled") {
        metrics.startupFailures += 1;
        const wrappedError =
          result.reason instanceof Error
            ? result.reason
            : new Error(String(result.reason));
        recordStartupError(metrics, wrappedError);
        continue;
      }

      if (result.value.ok) {
        sessions.push(result.value.session);
        if (result.value.roomJoined) {
          roomReadySessions.push(result.value.session);
        }
        continue;
      }

      if (isSocketTicketRateLimit(result.value.error)) {
        sawRateLimit = true;
      }
    }

    if (joinRoomDuringStartup) {
      info(
        `Started ${sessions.length}/${config.vus} VUs, room joined ${roomReadySessions.length}, failed ${metrics.failedRoomJoins}`,
      );
    } else {
      info(`Started ${sessions.length}/${config.vus} VUs, failed ${metrics.startupFailures}`);
    }

    if (sawRateLimit) {
      warn(
        `socket-ticket rate limited before target VU count was reached; reduce VETRA_LOAD_RAMP_BATCH_SIZE or increase VETRA_LOAD_RAMP_BATCH_DELAY_MS (started ${sessions.length}/${config.vus} VUs)`,
      );
    }

    if (batchEnd < config.vus && !shutdownRequested) {
      await sleep(config.rampBatchDelayMs);
    }
  }

  if (sessions.length === 0) {
    fail("No virtual users started successfully.");
  }

  return {
    sessions,
    roomReadySessions,
  };
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

function createBoundedInFlightScheduler(options) {
  const {
    intervalMs,
    requestedMessageRate = null,
    maxInFlight,
    onTick,
    onSkip,
    onUnhandledError,
    stopAtMs = null,
  } = options;
  const pending = new Set();
  let maxObserved = 0;
  let skippedTicks = 0;
  let skippedSends = 0;
  let wakeCount = 0;
  let catchUpSends = 0;
  let startedAt = null;
  const sequentialMode = maxInFlight <= 1;
  let accountedSends = 0;
  const schedulerLagMs = [];

  const effectiveNow = () => {
    const now = performance.now();
    return stopAtMs === null ? now : Math.min(now, stopAtMs);
  };

  const startOperation = () => {
    let tracked = null;
    tracked = Promise.resolve()
      .then(() => onTick())
      .catch((error) => {
        onUnhandledError?.(error);
      })
      .finally(() => {
        pending.delete(tracked);
      });
    pending.add(tracked);
    if (pending.size > maxObserved) {
      maxObserved = pending.size;
    }

    return tracked;
  };

  const scheduleNextMonotonicWake = () => {
    if (startedAt === null) return null;

    const nextSendNumber = accountedSends + 1;
    const nextDueAt = startedAt + nextSendNumber * intervalMs;
    const now = performance.now();
    const targetWakeAt =
      stopAtMs === null ? nextDueAt : Math.min(nextDueAt, stopAtMs);

    return Math.max(0, targetWakeAt - now);
  };

  // Catch-up scheduling is needed here because timer drift across many VUs can
  // under-produce writes even when the backend is fast and there is no real
  // backpressure from WebSocket fanout or acks.
  const createCatchUpTicker = () => {
    let active = false;
    let timer = null;

    const schedule = (delayMs) => {
      timer = setTimeout(runTick, delayMs);
    };

    const runTick = async () => {
      if (!active) return;

      wakeCount += 1;

      try {
        const now = performance.now();
        if (stopAtMs !== null && now >= stopAtMs) {
          active = false;
          return;
        }

        const boundedNow = effectiveNow();
        const elapsedMs = Math.max(0, boundedNow - startedAt);
        const expectedSends = Math.floor(elapsedMs / intervalMs);
        const lagMs = Math.max(0, now - (startedAt + (accountedSends + 1) * intervalMs));
        schedulerLagMs.push(lagMs);

        const dueSends = Math.max(0, expectedSends - accountedSends);
        if (dueSends > 0) {
          const availableSlots = Math.max(0, maxInFlight - pending.size);
          const sendsToStart = Math.min(dueSends, availableSlots);
          const droppedSends = dueSends - sendsToStart;

          if (droppedSends > 0) {
            skippedTicks += 1;
            skippedSends += droppedSends;
            onSkip?.(pending.size, droppedSends);
          }

          if (sendsToStart > 1) {
            catchUpSends += sendsToStart - 1;
          }

          for (let index = 0; index < sendsToStart; index += 1) {
            startOperation();
          }

          accountedSends += dueSends;
        }
      } catch (error) {
        onUnhandledError?.(error);
      } finally {
        if (!active) {
          return;
        }

        if (stopAtMs !== null && performance.now() >= stopAtMs) {
          active = false;
          return;
        }

        schedule(scheduleNextMonotonicWake());
      }
    };

    return {
      start() {
        if (active) return;
        active = true;
        startedAt = performance.now();
        schedule(intervalMs);
      },
      stop() {
        active = false;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
    };
  };

  const ticker = sequentialMode
    ? createTicker(async () => {
        if (pending.size >= 1) {
          return;
        }

        await startOperation();
      }, intervalMs)
    : createCatchUpTicker();

  return {
    start() {
      if (sequentialMode) {
        startedAt = performance.now();
      }

      ticker.start();
    },
    async stopAndDrain(timeoutMs) {
      ticker.stop();
      const stoppedAt = effectiveNow();

      if (pending.size > 0) {
        await Promise.race([
          Promise.allSettled([...pending]),
          new Promise((resolve) => setTimeout(resolve, timeoutMs)),
        ]);
      }

      return {
        maxInFlightObserved: maxObserved,
        finalInFlightCount: pending.size,
        skippedTicksMaxInFlight: skippedTicks,
        skippedSendsMaxInFlight: skippedSends,
        requestedMessageRate:
          requestedMessageRate === null
            ? Number((1000 / intervalMs).toFixed(2))
            : Number(requestedMessageRate.toFixed(2)),
        expectedSendsByElapsedDuration:
          startedAt === null ? 0 : Math.floor(Math.max(0, stoppedAt - startedAt) / intervalMs),
        schedulerWakeCount: wakeCount,
        catchUpSends,
        schedulerLagMs,
        schedulerEffectiveMessagesPerSecond:
          startedAt === null
            ? null
            : approxRate(accountedSends, Math.max(0, stoppedAt - startedAt)),
      };
    },
  };
}

async function sleep(ms) {
  if (shutdownRequested) return;

  await Promise.race([
    new Promise((resolve) => setTimeout(resolve, ms)),
    interruptPromise,
  ]);
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

  const roomJoinedSessions =
    options.roomJoinedSessions ??
    (config.joinRoomDuringStartup
      ? sessions.filter((session) => session.roomChannels.has(target.roomId))
      : await joinRoomChannels(sessions, metrics, target));

  if (roomJoinedSessions.length === 0) {
    info("No VUs joined the room channel; cannot run channel message load");
    throw new Error("No VUs joined the room channel; cannot run channel message load");
  }

  if (!config.writeEnabled) {
    info("Write mode is disabled; joined channel topic only.");
    await sleep(config.durationSeconds * 1000);
    return;
  }

  warn("Write mode enabled. This will send tagged [load-test] channel messages.");
  const rate = options.messagesPerSecond ?? config.messagesPerSecond;
  const intervalMs = rateToIntervalMs(rate);
  const drainTimeoutMs = Math.max(config.messageTimeoutMs, 5000);
  const durationMs = config.durationSeconds * 1000;
  const stopAtMs = performance.now() + durationMs;
  let sendIndex = 0;

  const scheduler = createBoundedInFlightScheduler({
    intervalMs,
    requestedMessageRate: rate,
    maxInFlight: config.messageMaxInFlight,
    stopAtMs: config.messageMaxInFlight > 1 ? stopAtMs : null,
    onTick: async () => {
      const messageNumber = sendIndex + 1;
      const session = roomJoinedSessions[sendIndex % roomJoinedSessions.length];
      sendIndex = messageNumber;
      markSessionSendStarted(session);
      const sendStartedAt = performance.now();

      try {
        const roomChannel = await ensureRoomChannel(session, target, metrics);
        const content = `${loadPrefix} channel message vu=${session.label} n=${messageNumber}`;
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
          config.messageTimeoutMs,
        );
      } catch (error) {
        const activeSenderCount = roomJoinedSessions.filter(
          (candidate) =>
            candidate.canSendMessages && getSocketState(candidate) === "open",
        ).length;
        const activeReceiverCount = roomJoinedSessions.filter(
          (candidate) => getSocketState(candidate) === "open",
        ).length;
        recordMessageFailure(
          metrics,
          session,
          error,
          performance.now() - sendStartedAt,
          activeSenderCount,
          activeReceiverCount,
        );
        recordError(metrics, error);
      } finally {
        markSessionSendFinished(session);
      }
    },
    onUnhandledError: (error) => {
      recordError(metrics, error);
    },
  });

  scheduler.start();
  await sleep(durationMs);
  const schedulerSummary = await scheduler.stopAndDrain(drainTimeoutMs);
  metrics.maxMessageInFlightObserved = Math.max(
    metrics.maxMessageInFlightObserved,
    schedulerSummary.maxInFlightObserved,
  );
  metrics.finalMessageInFlightCount = schedulerSummary.finalInFlightCount;
  metrics.skippedSendTicksMaxInFlight +=
    schedulerSummary.skippedTicksMaxInFlight;
  metrics.skippedSendsMaxInFlight += schedulerSummary.skippedSendsMaxInFlight;
  metrics.schedulerRequestedMessageRate = schedulerSummary.requestedMessageRate;
  metrics.schedulerExpectedSendsByElapsedDuration =
    schedulerSummary.expectedSendsByElapsedDuration;
  metrics.schedulerWakeCount = schedulerSummary.schedulerWakeCount;
  metrics.schedulerCatchUpSends = schedulerSummary.catchUpSends;
  metrics.schedulerLagMs.push(...schedulerSummary.schedulerLagMs);
  metrics.schedulerEffectiveMessagesPerSecond =
    schedulerSummary.schedulerEffectiveMessagesPerSecond;
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
  const intervalMs = rateToIntervalMs(config.messagesPerSecond);
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
  const callee = await openUserSession(
    "callee",
    secondaryAuth,
    metrics,
    config.startupTimeoutMs,
  );
  try {
    await ensureCallChannel(callee, metrics);

    const caller = primarySessions[0];
    const callerCallRef = caller.auth.user.public_id ?? caller.auth.user.id;
    const calleeCallRef = callee.auth.user.public_id ?? callee.auth.user.id;
    let cycle = 0;
    const intervalMs = rateToIntervalMs(config.messagesPerSecond);

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
    closeSession(callee, metrics);
  }
}

async function runSoakMode(sessions, metrics, target) {
  const statsTicker = setInterval(() => {
    const summary = summarizeMetrics(metrics);
    console.log(
      `[load] soak stats: connects=${summary.totalSocketConnects} userJoins=${summary.successfulUserChannelJoins}/${summary.failedUserChannelJoins} roomJoins=${summary.successfulRoomJoins}/${summary.failedRoomJoins} acked=${summary.messagesAcked} failed=${summary.messagesFailed} broadcasts=${summary.receivedBroadcasts}`,
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

process.once("SIGINT", () => {
  requestShutdown("SIGINT");
});

async function main() {
  config = buildConfig();
  loadPrefix = `[load-test] ${new Date().toISOString()}`;
  isCleaningUp = false;
  activeSessions.clear();

  info(
    `message rate config: raw process.env.VETRA_LOAD_MESSAGES_PER_SECOND=${process.env.VETRA_LOAD_MESSAGES_PER_SECOND ?? "<unset>"} effective=${config.messagesPerSecond} source=${describeMessageRateSource()}`,
  );

  if (config.serverMonitorOnly) {
    await runServerMonitorOnly();
    return;
  }

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
  let roomReadySessions = [];
  const serverMonitor = createServerMonitor(metrics);
  let fatalError = null;

  try {
    serverMonitor?.start();
    const targets = await resolveTargets(primaryAuth, secondaryAuth);
    const sessionResults = await createSessions(primaryAuth, metrics, {
      roomTarget: targets.channelTarget,
      joinRoomDuringStartup:
        config.mode === "channel-messages" && config.joinRoomDuringStartup,
    });
    sessions.push(...sessionResults.sessions);
    roomReadySessions = sessionResults.roomReadySessions;

    switch (config.mode) {
      case "connect":
        await runConnectMode(sessions);
        break;
      case "channel-messages":
        await runChannelMessageMode(sessions, metrics, targets.channelTarget, {
          roomJoinedSessions: config.joinRoomDuringStartup
            ? roomReadySessions
            : undefined,
        });
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
    fatalError = error instanceof Error ? error : new Error(String(error));
  } finally {
    await serverMonitor?.stop();
    cleanupSessions(metrics, sessions);
    if (sessions.length > 0) {
      await sleep(250);
    }
  }

  printSummary(metrics);
  writeResults(metrics);

  if (fatalError) {
    throw fatalError;
  }
}

await main().catch((error) => {
  console.error(`\n[load] FAILED: ${error.message}`);
  process.exitCode = 1;
});
