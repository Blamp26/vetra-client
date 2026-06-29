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
    startupTimeoutMs: envInt("VETRA_LOAD_STARTUP_TIMEOUT_MS", 15000),
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
let shutdownRequested = false;
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

async function createSocketTicketWithTimeout(auth, timeoutMs) {
  const controller = new AbortController();
  return withTimeout(
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
    successfulJoins: 0,
    failedJoins: 0,
    messagesAttempted: 0,
    messagesAcked: 0,
    messagesFailed: 0,
    receivedBroadcasts: 0,
    expectedCloses: 0,
    unexpectedDisconnects: 0,
    disconnectCount: 0,
    connectLatenciesMs: [],
    joinLatenciesMs: [],
    ackLatenciesMs: [],
    errorsByType: {},
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
  const disconnectCount =
    metrics.expectedCloses + metrics.unexpectedDisconnects;
  return {
    duration: metrics.durationSeconds,
    requestedVus: metrics.vus,
    virtualUsers: metrics.vus,
    startedVus: metrics.startedVus,
    startupFailures: metrics.startupFailures,
    targetMode: metrics.mode,
    totalSocketConnects: metrics.totalSocketConnects,
    successfulJoins: metrics.successfulJoins,
    failedJoins: metrics.failedJoins,
    messagesAttempted: metrics.messagesAttempted,
    messagesAcked: metrics.messagesAcked,
    messagesFailed: metrics.messagesFailed,
    receivedBroadcasts: metrics.receivedBroadcasts,
    disconnectCount,
    expectedCloses: metrics.expectedCloses,
    unexpectedDisconnects: metrics.unexpectedDisconnects,
    approximateMessagesPerSecond: approxMessagesPerSecond(metrics),
    latenciesMs: buildLatencyStats(metrics.ackLatenciesMs),
    connectLatenciesMs: buildLatencyStats(metrics.connectLatenciesMs),
    joinLatenciesMs: buildLatencyStats(metrics.joinLatenciesMs),
    errorsByType: metrics.errorsByType,
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
  console.log(`successful joins: ${summary.successfulJoins}`);
  console.log(`failed joins: ${summary.failedJoins}`);
  console.log(`messages attempted: ${summary.messagesAttempted}`);
  console.log(`messages acked: ${summary.messagesAcked}`);
  console.log(`messages failed: ${summary.messagesFailed}`);
  console.log(`received broadcasts: ${summary.receivedBroadcasts}`);
  console.log(`disconnect count: ${summary.disconnectCount}`);
  console.log(`expected closes: ${summary.expectedCloses}`);
  console.log(`unexpected disconnects: ${summary.unexpectedDisconnects}`);
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
  const sample = {
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
  };

  return sample;
}

function buildRemoteMonitorScript() {
  const service = shellQuote(config.serverService);
  const port = shellQuote(config.serverPort);

  return `
service=${service}
port=${port}
timestamp=$(date -Iseconds)
pid=$(systemctl show "$service" -p MainPID --value 2>/dev/null || true)
echo "timestamp=$timestamp"
echo "pid=$pid"

if [ -n "$pid" ] && [ "$pid" != "0" ]; then
  ps_line=$(ps -p "$pid" -o %cpu=,%mem=,rss=,vsz=,etime= 2>/dev/null | head -n 1 | xargs || true)
  if [ -n "$ps_line" ]; then
    set -- $ps_line
    echo "cpuPercent=$1"
    echo "memPercent=$2"
    echo "rssKiB=$3"
    echo "vszKiB=$4"
    echo "etime=$5"
  fi
fi

mem_line=$(free -b | awk 'NR==2 {print $3" "$7}' 2>/dev/null || true)
set -- $mem_line
echo "usedMemBytes=\${1:-}"
echo "availableMemBytes=\${2:-}"

if ss -tan "sport = :$port" >/dev/null 2>&1; then
  tcp=$(ss -tan "sport = :$port" 2>/dev/null | tail -n +2 | wc -l)
else
  tcp=$(ss -tan 2>/dev/null | grep -c ":$port ")
fi
echo "tcpPortConnections=$tcp"
`.trim();
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

  const runSample = async () => {
    if (stopped || inFlight) return;
    inFlight = true;

    try {
      const { stdout } = await execFileAsync(
        "ssh",
        [
          config.serverSsh,
          "sh",
          "-lc",
          buildRemoteMonitorScript(),
        ],
        {
          timeout: config.monitorSshTimeoutMs,
        },
      );
      metrics.serverMonitor.samples.push(parseServerSample(stdout));
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

async function openUserSession(label, auth, metrics, timeoutMs) {
  if (typeof WebSocket === "undefined") {
    fail("This Node runtime does not expose a global WebSocket implementation.");
  }

  const session = {
    label,
    auth,
    socket: null,
    userChannel: null,
    roomChannels: new Map(),
    callChannel: null,
    cleanupStarted: false,
  };

  try {
    const ticket = await createSocketTicketWithTimeout(auth, timeoutMs);
    const socket = new Socket(config.socketUrl, {
      params: { socket_ticket: ticket.socket_ticket },
      transport: WebSocket,
      reconnectAfterMs: () => 10000,
    });
    session.socket = socket;

    socket.onClose(() => {
      if (session.cleanupStarted) {
        metrics.expectedCloses += 1;
      } else {
        metrics.unexpectedDisconnects += 1;
      }
      metrics.disconnectCount =
        metrics.expectedCloses + metrics.unexpectedDisconnects;
    });

    socket.onError((error) => {
      recordError(metrics, error instanceof Error ? error : new Error("Socket error"));
    });

    const connectLatency = await withTimeout(
      () => onSocketOpen(socket),
      "socket connect",
      timeoutMs,
      async () => {
        try {
          socket.disconnect();
        } catch {}
      },
    );
    metrics.totalSocketConnects += 1;
    metrics.connectLatenciesMs.push(connectLatency);

    const userChannel = socket.channel(`user:${auth.user.id}`, {});
    session.userChannel = userChannel;
    userChannel.on("new_message", () => {
      metrics.receivedBroadcasts += 1;
    });
    userChannel.on("new_room_message", () => {
      metrics.receivedBroadcasts += 1;
    });
    userChannel.on("incoming_call", () => {
      metrics.receivedBroadcasts += 1;
    });

    await joinChannel(
      userChannel,
      `${label} user:${auth.user.id}`,
      metrics,
      timeoutMs,
    );
    metrics.startedVus += 1;

    return session;
  } catch (error) {
    closeSession(session);
    throw error;
  }
}

function closeSession(session) {
  session.cleanupStarted = true;

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
    if (shutdownRequested) {
      break;
    }

    const batchEnd = Math.min(config.vus, index + config.rampBatchSize);
    const batchIndices = [];

    for (let cursor = index; cursor < batchEnd; cursor += 1) {
      batchIndices.push(cursor);
    }

    info(`Starting VUs ${index + 1}-${batchEnd}/${config.vus}`);

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
          return { ok: true, session, label };
        } catch (error) {
          metrics.startupFailures += 1;
          const wrappedError =
            error instanceof Error ? error : new Error(String(error));
          recordError(metrics, wrappedError);
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
        recordError(metrics, wrappedError);
        continue;
      }

      if (result.value.ok) {
        sessions.push(result.value.session);
        continue;
      }

      if (isSocketTicketRateLimit(result.value.error)) {
        sawRateLimit = true;
      }
    }

    info(`Started ${sessions.length}/${config.vus} VUs, failed ${metrics.startupFailures}`);

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

process.once("SIGINT", () => {
  requestShutdown("SIGINT");
});

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
  const serverMonitor = createServerMonitor(metrics);

  try {
    serverMonitor?.start();
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
    await serverMonitor?.stop();
    for (const session of sessions) {
      closeSession(session);
    }
    if (sessions.length > 0) {
      await sleep(250);
    }
  }

  printSummary(metrics);
  writeResults(metrics);
}

await main().catch((error) => {
  console.error(`\n[load] FAILED: ${error.message}`);
  process.exitCode = 1;
});
