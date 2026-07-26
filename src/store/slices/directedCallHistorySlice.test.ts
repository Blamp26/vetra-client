import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectedCallHistoryEntry } from "@/api/directedCallHistory";
import {
  createDirectedCallHistorySlice,
  type DirectedCallHistorySlice,
} from "./directedCallHistorySlice";

const { getHistoryMock } = vi.hoisted(() => ({
  getHistoryMock: vi.fn(),
}));

vi.mock("@/api/directedCallHistory", () => ({
  directedCallHistoryApi: { getHistory: getHistoryMock },
}));

const ids = {
  first: "11111111-1111-1111-1111-111111111111",
  second: "22222222-2222-2222-2222-222222222222",
  third: "33333333-3333-3333-3333-333333333333",
};

function entry(
  call_id: string,
  overrides: Partial<DirectedCallHistoryEntry> = {},
): DirectedCallHistoryEntry {
  return {
    call_id,
    status: "completed",
    peer: { user_id: "peer-public", username: "peer" },
    created_at: "2026-07-22T12:00:00.000000Z",
    ended_at: "2026-07-22T12:00:02.000000Z",
    duration_ms: 2000,
    ...overrides,
  };
}

function createHarness() {
  let state: DirectedCallHistorySlice;
  const get = () => state;
  const set = (update: any) => {
    const next = typeof update === "function" ? update(state) : update;
    state = { ...state, ...next };
  };
  const slice = createDirectedCallHistorySlice(set as any, get as any, {} as any);
  state = { ...slice };
  return { getState: get, state: () => state };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createDirectedCallHistorySlice", () => {
  beforeEach(() => {
    getHistoryMock.mockReset();
  });

  it("starts empty and idle", () => {
    const { state } = createHarness();
    expect(state()).toMatchObject({
      directedCallHistoryEntriesByCallId: {},
      directedCallHistoryOrderedCallIds: [],
      directedCallHistoryLoading: false,
      directedCallHistoryError: null,
      directedCallHistoryRequestGeneration: 0,
    });
  });

  it("refreshes successfully in server order", async () => {
    const harness = createHarness();
    getHistoryMock.mockResolvedValue([entry(ids.second), entry(ids.first)]);

    await harness.state().refreshDirectedCallHistory();

    expect(harness.state().directedCallHistoryOrderedCallIds).toEqual([ids.second, ids.first]);
    expect(harness.state().getDirectedCallHistoryEntries().map((item) => item.call_id)).toEqual([
      ids.second,
      ids.first,
    ]);
    expect(harness.state().directedCallHistoryLoading).toBe(false);
    expect(harness.state().directedCallHistoryError).toBeNull();
  });

  it("clears existing entries on an empty refresh", async () => {
    const harness = createHarness();
    getHistoryMock.mockResolvedValueOnce([entry(ids.first)]).mockResolvedValueOnce([]);

    await harness.state().refreshDirectedCallHistory();
    await harness.state().refreshDirectedCallHistory();

    expect(harness.state().getDirectedCallHistoryEntries()).toEqual([]);
  });

  it("merges unseen entries and leaves an empty merge unchanged", async () => {
    const harness = createHarness();
    getHistoryMock
      .mockResolvedValueOnce([entry(ids.first)])
      .mockResolvedValueOnce([entry(ids.third), entry(ids.second)])
      .mockResolvedValueOnce([]);

    await harness.state().refreshDirectedCallHistory();
    await harness.state().mergeDirectedCallHistory();
    const beforeEmptyMerge = harness.state().getDirectedCallHistoryEntries();
    await harness.state().mergeDirectedCallHistory();

    expect(harness.state().directedCallHistoryOrderedCallIds).toEqual([ids.first, ids.third, ids.second]);
    expect(harness.state().getDirectedCallHistoryEntries()).toEqual(beforeEmptyMerge);
  });

  it("updates known entries without moving or duplicating them", async () => {
    const harness = createHarness();
    getHistoryMock.mockResolvedValueOnce([entry(ids.first), entry(ids.second)]).mockResolvedValueOnce([
      entry(ids.second, { status: "missed" }),
      entry(ids.first, { duration_ms: 0 }),
    ]);

    await harness.state().refreshDirectedCallHistory();
    await harness.state().mergeDirectedCallHistory();

    expect(harness.state().directedCallHistoryOrderedCallIds).toEqual([ids.first, ids.second]);
    expect(harness.state().getDirectedCallHistoryEntry(ids.first)?.duration_ms).toBe(0);
    expect(harness.state().getDirectedCallHistoryEntry(ids.second)?.status).toBe("missed");
  });

  it("uses first duplicate position and last duplicate value within one response", async () => {
    const harness = createHarness();
    getHistoryMock.mockResolvedValue([
      entry(ids.first, { status: "call_ended" }),
      entry(ids.second),
      entry(ids.first, { status: "declined" }),
    ]);

    await harness.state().refreshDirectedCallHistory();

    expect(harness.state().directedCallHistoryOrderedCallIds).toEqual([ids.first, ids.second]);
    expect(harness.state().getDirectedCallHistoryEntry(ids.first)?.status).toBe("declined");
  });

  it("deduplicates duplicate IDs across responses", async () => {
    const harness = createHarness();
    getHistoryMock.mockResolvedValueOnce([entry(ids.first)]).mockResolvedValueOnce([
      entry(ids.first, { status: "missed" }),
      entry(ids.third),
    ]);

    await harness.state().refreshDirectedCallHistory();
    await harness.state().mergeDirectedCallHistory();

    expect(harness.state().directedCallHistoryOrderedCallIds).toEqual([ids.first, ids.third]);
    expect(harness.state().getDirectedCallHistoryEntries()).toHaveLength(2);
    expect(harness.state().getDirectedCallHistoryEntry(ids.first)?.status).toBe("missed");
  });

  it("preserves data and exposes public errors on failed refresh and merge", async () => {
    const harness = createHarness();
    getHistoryMock.mockResolvedValueOnce([entry(ids.first)]).mockRejectedValueOnce(new Error("refresh failed"));

    await harness.state().refreshDirectedCallHistory();
    await harness.state().refreshDirectedCallHistory();
    expect(harness.state().getDirectedCallHistoryEntries()).toEqual([entry(ids.first)]);
    expect(harness.state().directedCallHistoryError).toBe("refresh failed");

    getHistoryMock.mockRejectedValueOnce(new Error("merge failed"));
    await harness.state().mergeDirectedCallHistory();
    expect(harness.state().getDirectedCallHistoryEntries()).toEqual([entry(ids.first)]);
    expect(harness.state().directedCallHistoryError).toBe("merge failed");
    expect(harness.state().directedCallHistoryLoading).toBe(false);
  });

  it("transitions loading and clears the previous error on a new request", async () => {
    const harness = createHarness();
    const request = deferred<DirectedCallHistoryEntry[]>();
    getHistoryMock.mockReturnValue(request.promise);

    const loading = harness.state().refreshDirectedCallHistory();
    expect(harness.state().directedCallHistoryLoading).toBe(true);
    expect(harness.state().directedCallHistoryError).toBeNull();
    request.resolve([]);
    await loading;
    expect(harness.state().directedCallHistoryLoading).toBe(false);
  });

  it("fences an older refresh behind a newer refresh", async () => {
    const harness = createHarness();
    const older = deferred<DirectedCallHistoryEntry[]>();
    const newer = deferred<DirectedCallHistoryEntry[]>();
    getHistoryMock.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);

    const olderRequest = harness.state().refreshDirectedCallHistory();
    const newerRequest = harness.state().refreshDirectedCallHistory();
    newer.resolve([entry(ids.second)]);
    await newerRequest;
    older.resolve([entry(ids.first)]);
    await olderRequest;

    expect(harness.state().getDirectedCallHistoryEntries().map((item) => item.call_id)).toEqual([ids.second]);
  });

  it("fences an older error behind a newer refresh", async () => {
    const harness = createHarness();
    const older = deferred<DirectedCallHistoryEntry[]>();
    const newer = deferred<DirectedCallHistoryEntry[]>();
    getHistoryMock.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);

    const olderRequest = harness.state().refreshDirectedCallHistory();
    const newerRequest = harness.state().refreshDirectedCallHistory();
    newer.resolve([entry(ids.second)]);
    await newerRequest;
    older.reject(new Error("stale failure"));
    await olderRequest;

    expect(harness.state().getDirectedCallHistoryEntries().map((item) => item.call_id)).toEqual([ids.second]);
    expect(harness.state().directedCallHistoryError).toBeNull();
  });

  it("fences an older merge behind a newer refresh", async () => {
    const harness = createHarness();
    getHistoryMock.mockResolvedValueOnce([entry(ids.first)]);
    await harness.state().refreshDirectedCallHistory();

    const olderMerge = deferred<DirectedCallHistoryEntry[]>();
    const newerRefresh = deferred<DirectedCallHistoryEntry[]>();
    getHistoryMock.mockReturnValueOnce(olderMerge.promise).mockReturnValueOnce(newerRefresh.promise);
    const mergeRequest = harness.state().mergeDirectedCallHistory();
    const refreshRequest = harness.state().refreshDirectedCallHistory();
    newerRefresh.resolve([entry(ids.third)]);
    await refreshRequest;
    olderMerge.resolve([entry(ids.second)]);
    await mergeRequest;

    expect(harness.state().getDirectedCallHistoryEntries().map((item) => item.call_id)).toEqual([ids.third]);
  });

  it("fences delayed success and failure after reset or disposal", async () => {
    const harness = createHarness();
    const delayedSuccess = deferred<DirectedCallHistoryEntry[]>();
    getHistoryMock.mockReturnValueOnce(delayedSuccess.promise);
    const resetRequest = harness.state().refreshDirectedCallHistory();
    harness.state().resetDirectedCallHistory();
    delayedSuccess.resolve([entry(ids.first)]);
    await resetRequest;
    expect(harness.state().getDirectedCallHistoryEntries()).toEqual([]);

    const delayedFailure = deferred<DirectedCallHistoryEntry[]>();
    getHistoryMock.mockReturnValueOnce(delayedFailure.promise);
    const disposeRequest = harness.state().refreshDirectedCallHistory();
    harness.state().disposeDirectedCallHistory();
    delayedFailure.reject(new Error("stale failure"));
    await disposeRequest;
    expect(harness.state().getDirectedCallHistoryEntries()).toEqual([]);
    expect(harness.state().directedCallHistoryError).toBeNull();
  });

  it("returns immutable ordered and lookup selector values", async () => {
    const harness = createHarness();
    getHistoryMock.mockResolvedValue([entry(ids.first)]);
    await harness.state().refreshDirectedCallHistory();

    const ordered = harness.state().getDirectedCallHistoryEntries();
    ordered[0].status = "missed";
    ordered[0].peer!.username = "mutated";
    ordered.push(entry(ids.second));
    const lookup = harness.state().getDirectedCallHistoryEntry(ids.first);

    expect(lookup).toEqual(entry(ids.first));
    expect(harness.state().getDirectedCallHistoryEntries()).toEqual([entry(ids.first)]);
  });

  it("stores only the public entry model", async () => {
    const harness = createHarness();
    const unsafe = {
      ...entry(ids.first),
      caller_id: 11,
      device_id: "private-device",
      command_id: "private-command",
      reservation_id: "private-reservation",
    };
    getHistoryMock.mockResolvedValue([unsafe]);

    await harness.state().refreshDirectedCallHistory();

    expect(harness.state().getDirectedCallHistoryEntry(ids.first)).toEqual(entry(ids.first));
  });
});
