import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./base";
import {
  directedCallHistoryApi,
  normalizeDirectedCallHistoryResponse,
  type DirectedCallHistoryStatus,
} from "./directedCallHistory";

const { getStringMock, removeMock } = vi.hoisted(() => ({
  getStringMock: vi.fn(),
  removeMock: vi.fn(),
}));

vi.mock("@/shared/utils/storage", () => ({
  STORAGE_KEYS: { TOKEN: "token", USER: "user" },
  storage: { getString: getStringMock, remove: removeMock },
}));

const callIds = [
  "11111111-1111-1111-1111-111111111111",
  "22222222-2222-2222-2222-222222222222",
];

function entry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    call_id: callIds[0],
    status: "completed",
    peer: { user_id: "peer-public", username: "peer" },
    created_at: "2026-07-22T12:00:00.000000Z",
    ended_at: "2026-07-22T12:00:02.000000Z",
    duration_ms: 2000,
    ...overrides,
  };
}

function mockSuccess(data: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: vi.fn().mockResolvedValue(JSON.stringify({ data })),
  }));
}

describe("directedCallHistoryApi", () => {
  beforeEach(() => {
    getStringMock.mockReset();
    getStringMock.mockReturnValue("test-token");
    removeMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("parses the public response and preserves server ordering", async () => {
    mockSuccess([
      entry({ call_id: callIds[0], duration_ms: 0 }),
      entry({ call_id: callIds[1], status: "missed", peer: null, duration_ms: null }),
    ]);

    await expect(directedCallHistoryApi.getHistory()).resolves.toEqual([
      {
        call_id: callIds[0],
        status: "completed",
        peer: { user_id: "peer-public", username: "peer" },
        created_at: "2026-07-22T12:00:00.000000Z",
        ended_at: "2026-07-22T12:00:02.000000Z",
        duration_ms: 0,
      },
      {
        call_id: callIds[1],
        status: "missed",
        peer: null,
        created_at: "2026-07-22T12:00:00.000000Z",
        ended_at: "2026-07-22T12:00:02.000000Z",
        duration_ms: null,
      },
    ]);
  });

  it("omits limit when it is not supplied", async () => {
    mockSuccess([]);
    await directedCallHistoryApi.getHistory();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/directed-calls\/history$/),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("serializes the optional limit with existing query conventions", async () => {
    mockSuccess([]);
    await directedCallHistoryApi.getHistory({ limit: 25 });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/directed-calls\/history\?limit=25$/),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it.each([
    "couldn't_reach",
    "user_busy",
    "cancelled",
    "missed",
    "no_answer",
    "declined",
    "call_failed",
    "call_ended",
    "completed",
  ] as DirectedCallHistoryStatus[])('accepts public status "%s"', async (status) => {
    mockSuccess([entry({ status })]);
    await expect(directedCallHistoryApi.getHistory()).resolves.toHaveLength(1);
  });

  it("accepts omitted and null peer identity and nullable terminal fields", async () => {
    mockSuccess([
      entry({ peer: undefined, ended_at: undefined, duration_ms: undefined }),
      entry({ peer: null, ended_at: null, duration_ms: null }),
    ]);

    await expect(directedCallHistoryApi.getHistory()).resolves.toEqual([
      expect.objectContaining({ peer: null, ended_at: null, duration_ms: null }),
      expect.objectContaining({ peer: null, ended_at: null, duration_ms: null }),
    ]);
  });

  it("accepts a complete public peer", async () => {
    mockSuccess([entry({ peer: { user_id: "peer-public", username: "peer" } })]);
    await expect(directedCallHistoryApi.getHistory()).resolves.toEqual([
      expect.objectContaining({ peer: { user_id: "peer-public", username: "peer" } }),
    ]);
  });

  it("strips private and unrecognized response fields from the returned model", async () => {
    mockSuccess([
      {
        ...entry(),
        caller_id: 11,
        recipient_id: 22,
        device_id: "private-device",
        command_id: "private-command",
        setup_failure_code: "private-reason",
        private_reason: "private-resolution-reason",
        peer: {
          user_id: "peer-public",
          username: "peer",
          internal_id: 22,
        },
      },
    ]);

    const [result] = await directedCallHistoryApi.getHistory();
    expect(result).toEqual(entry());
    expect(result).not.toHaveProperty("caller_id");
    expect(result).not.toHaveProperty("device_id");
    expect(result.peer).not.toHaveProperty("internal_id");
  });

  it.each([
    ["call_id", entry({ call_id: "not-a-uuid" })],
    ["status", entry({ status: "unknown" })],
    ["created_at", entry({ created_at: "not-a-timestamp" })],
    ["ended_at", entry({ ended_at: "not-a-timestamp" })],
    ["peer.user_id", entry({ peer: { username: "peer" } })],
    ["peer.username", entry({ peer: { user_id: "peer-public" } })],
    ["peer.user_id", entry({ peer: { user_id: null, username: "peer" } })],
    ["peer.username", entry({ peer: { user_id: "peer-public", username: null } })],
    ["peer.user_id", entry({ peer: { user_id: 22, username: "peer" } })],
    ["peer.username", entry({ peer: { user_id: "peer-public", username: 22 } })],
    ["duration_ms", entry({ duration_ms: "2000" })],
    ["duration_ms", entry({ duration_ms: 1.5 })],
    ["duration_ms", entry({ duration_ms: -1 })],
  ])("rejects malformed %s", async (_field, value) => {
    mockSuccess([value]);
    await expect(directedCallHistoryApi.getHistory()).rejects.toThrow();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite duration_ms %s at the runtime normalization boundary",
    (duration_ms) => {
      expect(() => normalizeDirectedCallHistoryResponse([entry({ duration_ms })])).toThrow();
    },
  );

  it("rejects the complete response when any entry is malformed", async () => {
    mockSuccess([entry(), entry({ status: "unknown" })]);
    await expect(directedCallHistoryApi.getHistory()).rejects.toThrow();
  });

  it("propagates transport failures through ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: vi.fn().mockResolvedValue(JSON.stringify({ error: "history unavailable" })),
    }));

    await expect(directedCallHistoryApi.getHistory()).rejects.toEqual(
      new ApiError("history unavailable", 503),
    );
  });
});
