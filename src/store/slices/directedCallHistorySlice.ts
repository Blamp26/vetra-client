import {
  directedCallHistoryApi,
  type DirectedCallHistoryEntry,
  type DirectedCallHistoryParams,
} from "@/api/directedCallHistory";
import type { StateCreator } from "zustand";

export interface DirectedCallHistorySlice {
  directedCallHistoryEntriesByCallId: Record<string, DirectedCallHistoryEntry>;
  directedCallHistoryOrderedCallIds: string[];
  directedCallHistoryLoading: boolean;
  directedCallHistoryError: string | null;
  directedCallHistoryRequestGeneration: number;

  refreshDirectedCallHistory: (params?: DirectedCallHistoryParams) => Promise<void>;
  mergeDirectedCallHistory: (params?: DirectedCallHistoryParams) => Promise<void>;
  resetDirectedCallHistory: () => void;
  disposeDirectedCallHistory: () => void;
  getDirectedCallHistoryEntries: () => DirectedCallHistoryEntry[];
  getDirectedCallHistoryEntry: (callId: string) => DirectedCallHistoryEntry | undefined;
}

function cloneEntry(entry: DirectedCallHistoryEntry): DirectedCallHistoryEntry {
  return {
    call_id: entry.call_id,
    status: entry.status,
    peer: entry.peer
      ? { user_id: entry.peer.user_id, username: entry.peer.username }
      : null,
    created_at: entry.created_at,
    ended_at: entry.ended_at,
    duration_ms: entry.duration_ms,
  };
}

function publicError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasCallId(entries: Record<string, DirectedCallHistoryEntry>, callId: string): boolean {
  return Object.prototype.hasOwnProperty.call(entries, callId);
}

function applyEntries(
  entriesByCallId: Record<string, DirectedCallHistoryEntry>,
  orderedCallIds: string[],
  incoming: DirectedCallHistoryEntry[],
): { entriesByCallId: Record<string, DirectedCallHistoryEntry>; orderedCallIds: string[] } {
  const nextEntries = { ...entriesByCallId };
  const nextOrderedCallIds = [...orderedCallIds];

  for (const entry of incoming) {
    if (!hasCallId(nextEntries, entry.call_id)) {
      nextOrderedCallIds.push(entry.call_id);
    }
    nextEntries[entry.call_id] = cloneEntry(entry);
  }

  return {
    entriesByCallId: nextEntries,
    orderedCallIds: nextOrderedCallIds,
  };
}

export const createDirectedCallHistorySlice: StateCreator<
  any,
  [],
  [],
  DirectedCallHistorySlice
> = (set, get) => {
  const startRequest = () => {
    const generation = get().directedCallHistoryRequestGeneration + 1;
    set({
      directedCallHistoryLoading: true,
      directedCallHistoryError: null,
      directedCallHistoryRequestGeneration: generation,
    });
    return generation;
  };

  const isCurrentRequest = (generation: number) =>
    get().directedCallHistoryRequestGeneration === generation;

  const finishRequest = (generation: number, error?: unknown) => {
    if (!isCurrentRequest(generation)) return;
    set({
      directedCallHistoryLoading: false,
      directedCallHistoryError: error === undefined ? null : publicError(error),
    });
  };

  const load = async (mode: "refresh" | "merge", params?: DirectedCallHistoryParams) => {
    const generation = startRequest();

    try {
      const incoming = await directedCallHistoryApi.getHistory(params);
      if (!isCurrentRequest(generation)) return;

      if (mode === "refresh") {
        const next = applyEntries({}, [], incoming);
        set({
          directedCallHistoryEntriesByCallId: next.entriesByCallId,
          directedCallHistoryOrderedCallIds: next.orderedCallIds,
        });
      } else if (incoming.length > 0) {
        const current = get();
        const next = applyEntries(
          current.directedCallHistoryEntriesByCallId,
          current.directedCallHistoryOrderedCallIds,
          incoming,
        );
        set({
          directedCallHistoryEntriesByCallId: next.entriesByCallId,
          directedCallHistoryOrderedCallIds: next.orderedCallIds,
        });
      }

      finishRequest(generation);
    } catch (error) {
      finishRequest(generation, error);
    }
  };

  const reset = () => {
    set((state: any) => ({
      directedCallHistoryEntriesByCallId: {},
      directedCallHistoryOrderedCallIds: [],
      directedCallHistoryLoading: false,
      directedCallHistoryError: null,
      directedCallHistoryRequestGeneration:
        state.directedCallHistoryRequestGeneration + 1,
    }));
  };

  return {
    directedCallHistoryEntriesByCallId: {},
    directedCallHistoryOrderedCallIds: [],
    directedCallHistoryLoading: false,
    directedCallHistoryError: null,
    directedCallHistoryRequestGeneration: 0,

    refreshDirectedCallHistory: (params) => load("refresh", params),
    mergeDirectedCallHistory: (params) => load("merge", params),
    resetDirectedCallHistory: reset,
    disposeDirectedCallHistory: reset,
    getDirectedCallHistoryEntries: () => {
      const state = get();
      return state.directedCallHistoryOrderedCallIds
        .map((callId: string) => state.directedCallHistoryEntriesByCallId[callId])
        .filter((entry: DirectedCallHistoryEntry | undefined): entry is DirectedCallHistoryEntry => Boolean(entry))
        .map(cloneEntry);
    },
    getDirectedCallHistoryEntry: (callId) => {
      const entry = get().directedCallHistoryEntriesByCallId[callId];
      return entry ? cloneEntry(entry) : undefined;
    },
  };
};
